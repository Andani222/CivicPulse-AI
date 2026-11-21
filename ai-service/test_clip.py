
from transformers import CLIPModel, CLIPProcessor
from PIL import Image
import torch

# Load the pretrained CLIP model
MODEL_ID = "openai/clip-vit-base-patch32"

print("Loading CivicPulse image AI...")

processor = CLIPProcessor.from_pretrained(MODEL_ID)
model = CLIPModel.from_pretrained(MODEL_ID)

model.eval()

# CivicPulse reporting categories
CATEGORIES = [
    "A photograph of illegal dumping or piles of rubbish",
    "A photograph of a pothole or damaged road",
    "A photograph of a broken streetlight",
    "A photograph of a sewage leak or overflowing sewage",
    "A photograph of another municipal problem"
]


def classify_image(image_path):
    image = Image.open(image_path).convert("RGB")

    inputs = processor(
        text=CATEGORIES,
        images=image,
        return_tensors="pt",
        padding=True
    )

    with torch.no_grad():
        outputs = model(**inputs)

    scores = outputs.logits_per_image.softmax(dim=1)[0]

    results = sorted(
        zip(CATEGORIES, scores.tolist()),
        key=lambda item: item[1],
        reverse=True
    )

    print("\nCIVICPULSE IMAGE ANALYSIS")
    print("-" * 40)

    for category, score in results:
        print(f"{category}: {score:.2%}")

    print("\nSuggested category:")
    print(results[0][0])


if __name__ == "__main__":
    image_path = input("Enter the full path to a test image: ")
    classify_image(image_path)
