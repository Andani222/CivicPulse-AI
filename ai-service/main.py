import base64
import json
import os

from groq import AsyncGroq
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from io import BytesIO

import torch
from PIL import Image, ImageFilter, ImageStat, UnidentifiedImageError
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from transformers import CLIPModel, CLIPProcessor

# --------------------------------------------------
# GROQ CLOUD CONFIGURATION
# --------------------------------------------------

load_dotenv(
    dotenv_path=os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        ".env"
    ),
    override=True
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")

groq_client = (
    AsyncGroq(api_key=GROQ_API_KEY)
    if GROQ_API_KEY
    else None
)

# --------------------------------------------------
# CLIP MODEL CONFIGURATION
# --------------------------------------------------

MODEL_ID = "openai/clip-vit-base-patch32"

CATEGORIES = {
    "Illegal Dumping": "A photograph of illegal dumping or piles of rubbish",
    "Pothole": "A photograph of a pothole or damaged road",
    "Broken Streetlight": "A photograph of a broken streetlight",
    "Sewage Problem": "A photograph of a sewage leak or overflowing sewage",
    "Other": "A photograph of another municipal problem"
}


# --------------------------------------------------
# IMAGE QUALITY AND RELEVANCE CHECKS
# --------------------------------------------------

UNRELATED_DESCRIPTION = (
    "A photograph of an unrelated subject such as food, "
    "pets, people, selfies, documents or indoor objects, "
    "with no visible municipal infrastructure problem"
)


def inspect_image_quality(image):
    """
    Initial heuristic checks. Thresholds must be calibrated
    using real CivicPulse test photographs.
    """

    width, height = image.size
    warnings = []

    # Check image dimensions
    if width < 320 or height < 320:
        warnings.append(
            "The photograph has a low resolution. "
            "Try taking a clearer photograph."
        )

    # Analyse a smaller grayscale copy
    grayscale = image.convert("L")
    grayscale.thumbnail((512, 512))

    brightness = ImageStat.Stat(grayscale).mean[0]

    # Estimate sharpness using edge variation.
    # This is a heuristic, not a definitive blur detector.
    edges = grayscale.filter(ImageFilter.FIND_EDGES)
    edge_variance = ImageStat.Stat(edges).var[0]

    if brightness < 45:
        warnings.append(
            "The photograph appears too dark. "
            "Try taking it in better lighting."
        )
    elif brightness > 220:
        warnings.append(
            "The photograph appears overexposed. "
            "Try reducing the glare or bright light."
        )

    if edge_variance < 90:
        warnings.append(
            "The photograph may be blurry or out of focus. "
            "Try taking another photograph."
        )

    if any(
        warning for warning in warnings
        if "low resolution" in warning
        or "blurry" in warning
    ):
        status = "poor"
    elif warnings:
        status = "review"
    else:
        status = "good"

    return {
        "status": status,
        "width": width,
        "height": height,
        "brightness": round(brightness, 2),
        "sharpness_estimate": round(edge_variance, 2),
        "warnings": warnings
    }


def assess_image_relevance(category_scores):
    """
    Compare municipal categories against an unrelated-image
    description. CLIP scores are relative comparisons, not
    calibrated probabilities.
    """

    unrelated_score = category_scores["Unrelated"]

    municipal_scores = {
        category: score
        for category, score in category_scores.items()
        if category != "Unrelated"
    }

    best_category = max(
        municipal_scores,
        key=municipal_scores.get
    )

    best_score = municipal_scores[best_category]
    score_difference = best_score - unrelated_score

    if unrelated_score >= best_score:
        relevance = "unrelated"
        review_required = True
        message = (
            "This photograph may not show a municipal problem. "
            "Please check the photograph or continue without one."
        )

    elif score_difference < 0.03:
        relevance = "uncertain"
        review_required = True
        message = (
            "CivicPulse is unsure whether this photograph "
            "shows a municipal problem. Please review it."
        )

    else:
        relevance = "relevant"
        review_required = False
        message = (
            "The photograph appears related to a municipal issue."
        )

    return {
        "status": relevance,
        "review_required": review_required,
        "message": message,
        "unrelated_score": round(unrelated_score, 4),
        "municipal_category": best_category
    }


processor = None
model = None


# --------------------------------------------------
# LOAD MODEL WHEN SERVICE STARTS
# --------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global processor, model

    print("Loading CivicPulse CLIP model...")

    processor = CLIPProcessor.from_pretrained(MODEL_ID)
    model = CLIPModel.from_pretrained(MODEL_ID)
    model.eval()

    print("CivicPulse CLIP model loaded successfully!")

    yield

    print("CivicPulse AI service shutting down.")


# --------------------------------------------------
# FASTAPI APPLICATION
# --------------------------------------------------

app = FastAPI(
    title="CivicPulse AI Service",
    description="AI-powered municipal reporting and analysis",
    version="1.0.0",
    lifespan=lifespan
)


# --------------------------------------------------
# HOME ENDPOINT
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "success": True,
        "message": "CivicPulse AI Service is running!"
    }


# --------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------

@app.get("/api/health")
def health_check():
    return {
        "success": True,
        "service": "CivicPulse AI",
        "status": "healthy",
        "ai_models": {
            "image_classification": (
                "loaded" if model is not None else "not_loaded"
            ),
            "text_analysis": "handled_by_groq" if groq_client is not None else "not_configured",
            "duplicate_detection": "not_loaded",
            "generative_ai": "configured" if groq_client is not None else "not_configured"
        }
    }


# --------------------------------------------------
# AI VISUAL DESCRIPTION
# --------------------------------------------------

async def describe_uploaded_image(image_data):
    """
    Uses Qwen vision to describe the photograph
    and explain possible image relevance.
    """

    if groq_client is None:
        return {
            "available": False,
            "resident_image_description": None,
            "relevance": "uncertain",
            "resident_feedback": (
                "We could not analyse the photograph. "
                "Please check that it clearly shows your reported issue."
            )
        }

    try:
        # Resize and compress the image
        with Image.open(BytesIO(image_data)) as source:
            source.load()
            processed = source.convert("RGB")
            processed.thumbnail((1280, 1280))

            buffer = BytesIO()
            processed.save(
                buffer,
                format="JPEG",
                quality=75,
                optimize=True
            )

            encoded = base64.b64encode(
                buffer.getvalue()
            ).decode("utf-8")

        image_url = f"data:image/jpeg;base64,{encoded}"

        response = await groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": """
You are CivicPulse's photograph explanation assistant.

Your job is to explain what is visibly present in a
photograph submitted for a municipal problem report.

Be accurate and conservative.

RULES:
1. Describe only things you can actually see.
2. Do not invent objects, locations or circumstances.
3. Do not assume water is sewage based on appearance.
4. Do not assume a road defect is a pothole.
5. Identify unrelated subjects where possible, such as
   cats, dogs, food, selfies or screenshots.
6. If the image is unclear, say so.
7. If a municipal problem is visible, explain what
   appears to be wrong.
8. Never claim that an issue has been verified.


Return ONLY valid JSON with these fields:

{
  "resident_image_description": "This image shows a pothole in the road.",
  "relevance": "relevant",
  "resident_feedback": "Please confirm that this is the issue you want to report."
}

Relevance must be one of:
relevant, unrelated, uncertain.

DESCRIPTION RULES:
1. Start with "This image shows..." where appropriate.
2. Use one short sentence, ideally fewer than 12 words.
3. Describe only what is visibly present.
4. Do not make assumptions or claim that an issue is verified.

FEEDBACK RULES:
1. Keep feedback under 15 words where possible.
2. For unrelated images, politely explain that the image does not show a municipal issue and request a relevant photograph.
3. For relevant images, ask the resident to confirm that the photograph shows their reported issue.
4. For uncertain images, explain that the image is unclear and request another photograph.

"""
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Please describe what is visible "
                                "and assess whether this photograph "
                                "appears relevant to a municipal "
                                "problem report."
                            )
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": image_url
                            }
                        }
                    ]
                }
            ],
            response_format={"type": "json_object"},
            temperature=0,
            max_completion_tokens=300
        )

        result = json.loads(
            response.choices[0].message.content
        )

        allowed_relevance = {
            "relevant",
            "unrelated",
            "uncertain"
        }

        description = result.get("resident_image_description")
        feedback = result.get("resident_feedback")
        relevance = result.get("relevance")

        if (
            not isinstance(description, str)
            or not isinstance(feedback, str)
            or relevance not in allowed_relevance
        ):
            raise ValueError("Invalid visual assessment.")

        return {
            "available": True,
            "resident_image_description": description,
            "relevance": relevance,
            "resident_feedback": feedback
        }

    except Exception as error:
        print("Visual description failed:", str(error))

        return {
            "available": False,
            "resident_image_description": None,
            "relevance": "uncertain",
            "resident_feedback": (
                "We couldn't analyse this photograph. "
                "Please check that it clearly shows your reported issue."
            )
        }


# --------------------------------------------------
# IMAGE CLASSIFICATION ENDPOINT
# --------------------------------------------------

@app.post("/api/classify-image")
async def classify_image(file: UploadFile = File(...)):

    if model is None or processor is None:
        raise HTTPException(
            status_code=503,
            detail="Image classification model is not ready."
        )

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a valid image."
        )

    try:
        image_data = await file.read()

        if not image_data:
            raise HTTPException(
                status_code=400,
                detail="The uploaded image is empty."
            )

        if len(image_data) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Image must not exceed 10 MB."
            )

        image = Image.open(BytesIO(image_data)).convert("RGB")

    except UnidentifiedImageError:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file could not be read as an image."
        )

    except OSError:
        raise HTTPException(
            status_code=400,
            detail="The uploaded image could not be processed."
        )

    finally:
        await file.close()

    # 1. Inspect image quality
    quality = inspect_image_quality(image)

    # 2. Prepare municipal and unrelated descriptions
    category_names = list(CATEGORIES.keys())

    candidate_names = category_names + ["Unrelated"]

    candidate_descriptions = (
        list(CATEGORIES.values())
        + [UNRELATED_DESCRIPTION]
    )

    inputs = processor(
        text=candidate_descriptions,
        images=image,
        return_tensors="pt",
        padding=True
    )

    # 3. Run CLIP inference
    with torch.no_grad():
        outputs = model(**inputs)

    scores = outputs.logits_per_image.softmax(dim=1)[0]

    results = sorted(
        zip(candidate_names, scores.tolist()),
        key=lambda item: item[1],
        reverse=True
    )

    score_map = {
        name: float(score)
        for name, score in results
    }

    # 4. Select the best municipal category separately
    municipal_results = [
        (name, score)
        for name, score in results
        if name != "Unrelated"
    ]

    predicted_category, top_score = municipal_results[0]

    # 5. Assess whether the photograph appears relevant
    relevance = assess_image_relevance(score_map)

    # 6. Ask Qwen to describe what is actually visible
    visual_assessment = await describe_uploaded_image(image_data)

    # Combine the two AI assessments conservatively.
    # Qwen can request additional review, but cannot
    # automatically reject a resident's report.

    if visual_assessment["available"]:
        if visual_assessment["relevance"] in {
            "unrelated",
            "uncertain"
        }:
            relevance["status"] = visual_assessment["relevance"]
            relevance["review_required"] = True
            relevance["message"] = visual_assessment["resident_feedback"]

    review_required = (
        quality["status"] != "good"
        or relevance["review_required"]
        or not visual_assessment["available"]
    )

    return {
        "visual_assessment": visual_assessment,
        "success": True,
        "predicted_category": predicted_category,
        "score": round(float(top_score), 4),

        "scores": {
            category: round(float(score_map[category]), 4)
            for category in category_names
        },

        "quality": quality,
        "relevance": relevance,
        "review_required": review_required,

        "model": MODEL_ID,
        "message": (
            "Image assessment completed. "
            "Please review the suggestions before continuing."
            if review_required
            else "Image assessment completed successfully."
        )
    }



# --------------------------------------------------
# REPORT PRIORITY ANALYSIS
# --------------------------------------------------

def determine_priority(category, description):
    """
    Explainable prototype priority rules.
    These recommendations require administrator review.
    """

    text = description.lower()

    critical_keywords = [
        "exposed electrical wires",
        "live electrical wires",
        "electrocution",
        "electric shock",
        "fire",
        "building collapse",
        "severely injured",
        "life threatening",
        "people trapped",
    ]

    high_keywords = [
        "vehicles swerving",
        "cars swerving",
        "accident",
        "major pothole",
        "deep pothole",
        "overflowing sewage",
        "sewage flooding",
        "water flooding",
        "road blocked",
        "streetlight fell",
        "fallen streetlight",
        "dangerous road",
        "near a school",
    ]

    medium_keywords = [
        "leaking",
        "damaged",
        "broken",
        "overflowing",
        "large amount",
        "bad smell",
        "blocked drain",
        "waste piling",
    ]

    # Critical: explicit immediate safety indicators.
    matched = [word for word in critical_keywords if word in text]

    if matched:
        return {
            "priority": "Critical",
            "reason": (
                "The description contains potential immediate "
                f"safety hazards: {', '.join(matched)}."
            ),
            "recommended_action": (
                "Escalate for immediate human assessment and "
                "appropriate emergency response if necessary."
            ),
            "factors": matched,
        }

    # High: significant reported hazards.
    matched = [word for word in high_keywords if word in text]

    if matched:
        return {
            "priority": "High",
            "reason": (
                "The description indicates a potentially serious "
                f"municipal issue: {', '.join(matched)}."
            ),
            "recommended_action": (
                "Prioritise municipal inspection and assess "
                "the need for urgent intervention."
            ),
            "factors": matched,
        }

    # Medium: identifiable damage or service problems.
    matched = [word for word in medium_keywords if word in text]

    if matched:
        return {
            "priority": "Medium",
            "reason": (
                "The description identifies a municipal "
                f"problem requiring attention: {', '.join(matched)}."
            ),
            "recommended_action": (
                "Schedule an inspection and determine "
                "the appropriate maintenance response."
            ),
            "factors": matched,
        }

    # Default: insufficient evidence of urgency.
    return {
        "priority": "Low",
        "reason": (
            "No specific high-severity indicators were identified "
            "in the written description. This does not establish "
            "that the issue is harmless."
        ),
        "recommended_action": (
            "Review the photograph and report details before "
            "assigning a final municipal priority."
        ),
        "factors": [],
    }


# --------------------------------------------------
# COMBINED REPORT ANALYSIS ENDPOINT
# --------------------------------------------------

@app.post("/api/analyse-report")
async def analyse_report(
    file: UploadFile = File(...),
    category: str = Form(...),
    description: str = Form(...)
):

    if model is None or processor is None:
        raise HTTPException(
            status_code=503,
            detail="AI model is not ready."
        )

    if category not in CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported report category."
        )

    if not description.strip() or len(description.strip()) < 10:
        raise HTTPException(
            status_code=400,
            detail="Description must contain at least 10 characters."
        )

    if file.content_type not in [
        "image/jpeg",
        "image/png",
        "image/webp"
    ]:
        raise HTTPException(
            status_code=400,
            detail="Only JPEG, PNG and WebP images are supported."
        )

    try:
        image_data = await file.read()

        if not image_data:
            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty."
            )

        if len(image_data) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Image must not exceed 10 MB."
            )

        image = Image.open(BytesIO(image_data)).convert("RGB")

    except UnidentifiedImageError:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a valid image."
        )

    finally:
        await file.close()

    # Classify the photograph using CLIP.
    category_names = list(CATEGORIES.keys())
    category_descriptions = list(CATEGORIES.values())

    inputs = processor(
        text=category_descriptions,
        images=image,
        return_tensors="pt",
        padding=True
    )

    with torch.no_grad():
        outputs = model(**inputs)

    scores = outputs.logits_per_image.softmax(dim=1)[0]

    results = sorted(
        zip(category_names, scores.tolist()),
        key=lambda item: item[1],
        reverse=True
    )

    predicted_category, top_score = results[0]

    # Generate an explainable priority recommendation.
    priority_analysis = determine_priority(
        category,
        description
    )

    # Compare resident-selected category with image prediction.
    category_matches = category == predicted_category

    return {
        "success": True,
        "analysis": {
            "submitted_category": category,
            "predicted_category": predicted_category,
            "image_category_matches": category_matches,
            "image_score": round(float(top_score), 4),
            "priority": priority_analysis["priority"],
            "reason": priority_analysis["reason"],
            "recommended_action": priority_analysis["recommended_action"],
            "factors": priority_analysis["factors"],
            "review_required": True,
        },
        "model": MODEL_ID,
        "message": "Report analysis completed successfully."
    }


# --------------------------------------------------
# GROQ CONNECTION TEST
# --------------------------------------------------

@app.get("/api/groq-test")
async def groq_test():

    if groq_client is None:
        raise HTTPException(
            status_code=503,
            detail="Groq API key is not configured."
        )

    try:
        response = await groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": "Reply with exactly: CivicPulse Groq connection successful."
                }
            ],
            temperature=0,
            max_completion_tokens=50
        )

        return {
            "success": True,
            "model": GROQ_MODEL,
            "response": response.choices[0].message.content
        }

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Groq connection failed: {str(error)}"
        )
    
    
# --------------------------------------------------
# CIVICPULSE MULTIMODAL REPORT ASSESSMENT
# --------------------------------------------------

@app.post("/api/ai/assess-report")
async def assess_report(
    file: UploadFile = File(...),
    category: str = Form(...),
    description: str = Form(...)
):

    # 1. Check Groq configuration
    if groq_client is None:
        raise HTTPException(
            status_code=503,
            detail="Groq AI service is not configured."
        )

    # 2. Validate description
    if not description.strip() or len(description.strip()) < 10:
        raise HTTPException(
            status_code=400,
            detail="Description must contain at least 10 characters."
        )

    # 3. Validate image format
    allowed_types = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ]

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only JPEG, PNG and WebP images are supported."
        )

    try:
        image_data = await file.read()

        if not image_data:
            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty."
            )

        if len(image_data) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Image must not exceed 10 MB."
            )

        # Verify that the uploaded file is a genuine image.
        image = Image.open(BytesIO(image_data))
        image.verify()

    except UnidentifiedImageError:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a valid image."
        )

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Could not process the uploaded image."
        )

    finally:
        await file.close()

    # 4. Resize and compress the image before sending it to Groq
    try:
        with Image.open(BytesIO(image_data)) as source_image:
            source_image.load()

            processed_image = source_image.convert("RGB")
            processed_image.thumbnail((1280, 1280))

            compressed_image = BytesIO()

            processed_image.save(
                compressed_image,
                format="JPEG",
                quality=75,
                optimize=True
            )

            processed_image_data = compressed_image.getvalue()

    except (UnidentifiedImageError, OSError):
        raise HTTPException(
            status_code=400,
            detail="Could not decode the uploaded image."
        )

    print(f"Original image: {len(image_data) / 1024:.2f} KB")
    print(f"Compressed image: {len(processed_image_data) / 1024:.2f} KB")

    encoded_image = base64.b64encode(
        processed_image_data
    ).decode("utf-8")

    image_url = f"data:image/jpeg;base64,{encoded_image}"

    # 5. Define the AI assessment instructions
    system_prompt = """
You are CivicPulse AI, an assistant that assesses municipal reports.

Your assessment is advisory. Municipal officials make final decisions.

EVIDENCE RULES:

1. Separate what is directly visible in the single uploaded photograph
   from what the resident says in the description.

2. visual_observations must contain only details directly visible
   in the photograph.

3. resident_claims must contain only claims explicitly stated by
   the resident. Do not present these as visually verified.

4. unverified_claims must contain material claims that cannot be
   confirmed from the photograph or supplied information.

5. Never infer that water is sewage, polluted or contaminated
   from its colour or appearance alone.

6. Do not invent smells, flies, injuries, exposure, traffic behaviour,
   measurements, counts, locations or circumstances.

7. Do not identify a building as a pump station unless the photograph
   provides clear evidence.

8. If the photograph is blurry, dark or unclear, acknowledge it.

9. Compare the selected category, photograph and description.
   Explain material disagreements.

10. Record serious reported hazards as resident claims requiring
    human verification.

RESIDENT-FACING IMAGE DESCRIPTION:

The AI must also generate a short description for the resident.

1. Start the description with "This image shows..."
2. Use one short sentence, ideally under 12 words.
3. Describe only what is visibly present.
4. Do not include technical explanations or lengthy details.
5. The description must be understandable at a glance on a mobile screen.

IMAGE RELEVANCE:

relevant: photograph supports the reported issue.
unrelated: photograph clearly depicts something unrelated.
uncertain: photograph is unclear or insufficient.
conflicting: photograph and description materially disagree.

RESIDENT-FACING FEEDBACK:

Generate a short message explaining the assessment and next action.

1. Keep feedback under 15 words.
2. Use simple, friendly language.
3. If unrelated, explain that the image is not a municipal issue
   and ask the resident to upload a relevant photograph.
4. If uncertain, briefly explain why another photograph may be needed.
5. If relevant, ask the resident to confirm the detected issue.
6. Never automatically reject a photograph.

SEVERITY:

Assess visual_severity only from visible evidence.
Assess description_severity from resident claims.
Use unknown when evidence is insufficient.

PRIORITY:

critical: credible immediate threat to life or serious safety.
high: significant damage or substantial public safety impact.
medium: clear municipal problem requiring attention.
low: clearly minor issue without urgent indicators.
undetermined: insufficient, uncertain or conflicting evidence.

If image_relevance is conflicting, uncertain or unrelated,
priority must be undetermined.

Do not assign high priority merely because water is extensive
or moving quickly.

HUMAN REVIEW:

Always set review_required to true.

Return ONLY valid JSON with these exact fields:

{
  "is_municipal_issue": true,
  "resident_image_description": "This image shows a cat in a tree.",
  "resident_feedback": "This isn't a municipal issue. Please upload a relevant photo."
  "image_relevance": "relevant",
  "detected_issue": "Pothole",
  "visual_severity": "medium",
  "description_severity": "high",
  "priority": "undetermined",
  "visual_observations": [],
  "resident_claims": [],
  "unverified_claims": [],
  "evidence": [],
  "reason": "Explain the assessment.",
  "recommended_action": "Recommend a practical next step.",
  "review_required": true
}

FIELD RULES:

is_municipal_issue: true, false or null.
image_relevance: relevant, unrelated, uncertain or conflicting.
visual_severity: low, medium, high, critical or unknown.
description_severity: low, medium, high, critical or unknown.
priority: low, medium, high, critical or undetermined.
detected_issue: short description or null.
visual_observations: array of strings.
resident_claims: array of strings.
unverified_claims: array of strings.
evidence: array of visual observations only.
reason: string.
recommended_action: string.
review_required: always true.
resident_image_description: short, factual sentence for the resident.
resident_feedback: short instruction for the resident, under 15 words.

If unrelated, set is_municipal_issue to false
and priority to undetermined.

Never manufacture evidence.
"""

    # 6. Send image and description to Groq
    try:
        response = await groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"Resident-selected category: {category}\n\n"
                                f"Resident description: {description}\n\n"
                                "Assess this photograph and report together."
                            )
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": image_url
                            }
                        }
                    ]
                }
            ],
            response_format={
                "type": "json_object"
            },
            temperature=0,
            max_completion_tokens=900
        )

        result_text = response.choices[0].message.content

        if not result_text:
            raise ValueError("The AI returned an empty response.")

        assessment = json.loads(result_text)

    except Exception as exc:
        print("\n========== GROQ AI ERROR ==========")
        print(f"Error type: {type(exc).__name__}")
        print(f"Error details: {str(exc)}")
        print("===================================\n")

        raise HTTPException(
            status_code=502,
            detail="CivicPulse could not complete the AI assessment."
        )

    # 7. Validate important response fields

    allowed_relevance = {
        "relevant",
        "unrelated",
        "uncertain",
        "conflicting"
    }

    allowed_severity = {
        "low",
        "medium",
        "high",
        "critical",
        "unknown"
    }

    allowed_priority = {
        "low",
        "medium",
        "high",
        "critical",
        "undetermined"
    }

    list_fields = [
        "visual_observations",
        "resident_claims",
        "unverified_claims",
        "evidence"
    ]

    valid_string_lists = all(
        isinstance(assessment.get(field), list)
        and all(
            isinstance(item, str)
            for item in assessment[field]
        )
        for field in list_fields
    )

    if (
        assessment.get("image_relevance") not in allowed_relevance
        or assessment.get("visual_severity") not in allowed_severity
        or assessment.get("description_severity") not in allowed_severity
        or assessment.get("priority") not in allowed_priority
        or not valid_string_lists
        or not isinstance(assessment.get("reason"), str)
        or not isinstance(assessment.get("recommended_action"), str)
        or not (
            isinstance(assessment.get("detected_issue"), str)
            or assessment.get("detected_issue") is None
        )
    ):
        raise HTTPException(
            status_code=502,
            detail="AI returned an invalid assessment structure."
        )

    if assessment.get("is_municipal_issue") not in [True, False, None]:
        raise HTTPException(
            status_code=502,
            detail="AI returned an invalid municipal issue classification."
        )

    # Enforce human review regardless of the model's response.
    assessment["review_required"] = True

    # Conflicting or insufficient evidence cannot receive
    # an automatic priority recommendation.
    if (
        assessment["image_relevance"] in {
            "conflicting",
            "uncertain",
            "unrelated"
        }
        or assessment["is_municipal_issue"] is None
        or assessment["is_municipal_issue"] is False
    ):
        assessment["priority"] = "undetermined"

    if assessment["image_relevance"] == "unrelated":
        assessment["is_municipal_issue"] = False
        assessment["priority"] = "undetermined"

    # 8. Return the structured assessment
    return {
        "success": True,
        "submitted_category": category,
        "assessment": assessment,
        "provider": "GroqCloud",
        "model": GROQ_MODEL,
        "message": "Multimodal report assessment completed."

    }
