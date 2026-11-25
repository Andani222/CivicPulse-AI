const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const authMiddleware = require('./middleware/authMiddleware');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const upload = require('./middleware/uploadMiddleware');
const path = require('path');
const reportUpload = require('./middleware/reportUploadMiddleware');
const fs = require('fs/promises');
const Report = require('./models/Report');
const adminMiddleware = require('./middleware/adminMiddleware');
const { sendPushNotifications } = require('./services/pushNotifications');

const app = express();
const PORT = process.env.PORT || 5000;

const AI_SERVICE_URL = (
  process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001'
).replace(/\/+$/, '');

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded report photographs
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Welcome endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the CivicPulse API!',
    status: 'running',
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'CivicPulse backend is healthy.',
  });
});

// --------------------------------------------------
// LOCATION ADDRESS SEARCH
// --------------------------------------------------

let lastNominatimRequestAt = 0;

app.get('/api/location/search', async (req, res) => {
  try {
    const query = req.query.q;

    if (typeof query !== 'string' || query.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Please enter at least 3 characters.',
      });
    }

    // Respect Nominatim's one-request-per-second policy.
    const now = Date.now();
    const timeSinceLastRequest = now - lastNominatimRequestAt;

    if (timeSinceLastRequest < 1100) {
      return res.status(429).json({
        success: false,
        message: 'Please wait a moment before searching again.',
      });
    }

    lastNominatimRequestAt = now;

    const searchUrl = new URL(
      'https://nominatim.openstreetmap.org/search'
    );

    searchUrl.searchParams.set('format', 'jsonv2');
    searchUrl.searchParams.set('addressdetails', '1');
    searchUrl.searchParams.set('limit', '5');
    searchUrl.searchParams.set('countrycodes', 'za');
    searchUrl.searchParams.set('q', query.trim());

    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CivicPulse/1.0 (municipal reporting application)',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(
        'Nominatim error:',
        response.status,
        await response.text()
      );

      return res.status(502).json({
        success: false,
        message: 'Address search service is temporarily unavailable.',
      });
    }

    const results = await response.json();

    return res.json({
      success: true,
      count: results.length,
      results,
    });

  } catch (error) {
    console.error('Location search error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to search for addresses.',
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      !name || !email || !password ||
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      name.trim().length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      password.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid name and email. Password must be at least 8 characters.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'resident',
      },
    });

  } catch (error) {
    console.error('Registration error:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Unable to register account.',
    });
  }
});


app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'resident',
      },
    });

  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to log in.',
    });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'resident',
      },
    });

  } catch (error) {
    console.error('User retrieval error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to retrieve user.',
    });
  }
});

// Register a device for push notifications
app.post('/api/notifications/register-token', authMiddleware, async (req, res) => {
  try {
    const { pushToken } = req.body;

    if (
      typeof pushToken !== 'string' ||
      !(
        pushToken.startsWith('ExponentPushToken[') ||
        pushToken.startsWith('ExpoPushToken[')
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'A valid Expo push token is required.',
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $addToSet: { pushTokens: pushToken },
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    return res.json({
      success: true,
      message: 'Push notification device registered successfully.',
    });

  } catch (error) {
    console.error('Push token registration error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to register notification device.',
    });
  }
});

// Convert MongoDB documents into API response objects
const formatReport = (document) => {
  const report = document.toObject();

  return {
    ...report,
    id: report._id.toString(),
    createdAt: report.createdAt.toISOString(),
  };
};

// Convert MongoDB documents into API response objects
async function notifyReportOwner(report, notification) {
  try {
    if (!report?.user) {
      return;
    }

    const resident = await User.findById(report.user)
      .select('pushTokens');

    if (!resident || !resident.pushTokens?.length) {
      console.log('No registered devices for this resident.');
      return;
    }

    await sendPushNotifications(
      resident.pushTokens,
      notification
    );

  } catch (error) {
    console.error(
      'Unable to prepare resident notification:',
      error.message
    );
  }
}


// --------------------------------------------------
// AI IMAGE CLASSIFICATION
// --------------------------------------------------

app.post(
  '/api/ai/classify-image',
  authMiddleware,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please upload an image.'
        });
      }

      // Prepare image for the Python AI service
      const formData = new FormData();

      const imageBlob = new Blob(
        [req.file.buffer],
        { type: req.file.mimetype }
      );

      formData.append(
        'file',
        imageBlob,
        req.file.originalname
      );

      // Forward image to FastAPI
      const aiResponse = await fetch(
        `${AI_SERVICE_URL}/api/classify-image`,
        {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(30000)
        }
      );

      const aiResult = await aiResponse.json();

      if (!aiResponse.ok) {
        return res.status(502).json({
          success: false,
          message: 'The AI service could not classify the image.',
          aiError: aiResult.detail || aiResult.message || 'AI service error.'
        });
      }

      return res.json({
        success: true,
        message: 'Image analysed successfully.',
        analysis: aiResult
      });

    } catch (error) {
      console.error('AI image classification error:', error);

      const unavailable =
        error.name === 'TimeoutError' ||
        error.cause?.code === 'ECONNREFUSED';

      return res.status(unavailable ? 503 : 500).json({
        success: false,
        message: unavailable
          ? 'The AI service is unavailable. Please try again.'
          : 'Unable to analyse the uploaded image.'
      });
    }
  }
);



app.post('/api/reports', authMiddleware, reportUpload.single('file'), async (req, res) => {
  try {
    const { category, description } = req.body;
    let { location } = req.body;

    // Multipart form data sends location as a string.
    if (typeof location === 'string') {
      try {
        location = JSON.parse(location);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Invalid location data.',
        });
      }
    }

    if (
      !category ||
      !description ||
      typeof description !== 'string' ||
      description.trim().length < 10 ||
      !location
    ) {
      return res.status(400).json({
        success: false,
        message: 'A category, location and description of at least 10 characters are required.',
      });
    }

    // Save photograph metadata if an image was uploaded.
    const photo = req.file
      ? {
          filename: req.file.filename,
          url: `/uploads/reports/${req.file.filename}`,
          mimeType: req.file.mimetype,
          size: req.file.size,
        }
      : null;

    // STEP 1: Save the resident's report first.
    const report = await Report.create({
      category,
      description: description.trim(),
      location,
      photoUri: null,
      photo: photo || {},
      user: req.user.id,

      analysis: {
        status: req.file ? 'processing' : 'not_applicable',
        priority: null,
        assessment: null,
        provider: null,
        model: null,
        assessedAt: null,
        error: null,
        possibleDuplicates: [],
      },

      submissionStatus: 'received',
    });

    // STEP 2: Run AI assessment if a photograph was uploaded.
    if (req.file) {
      try {
        const imageBuffer = await fs.readFile(req.file.path);

        const formData = new FormData();

        const imageBlob = new Blob(
          [imageBuffer],
          { type: req.file.mimetype }
        );

        formData.append(
          'file',
          imageBlob,
          req.file.originalname
        );

        formData.append('category', category);
        formData.append('description', description.trim());

        const aiResponse = await fetch(
          `${AI_SERVICE_URL}/api/ai/assess-report`,
          {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(90000),
          }
        );

        const aiResult = await aiResponse.json();

        if (!aiResponse.ok || !aiResult.success || !aiResult.assessment) {
          throw new Error(
            aiResult.detail ||
            aiResult.message ||
            'AI assessment failed.'
          );
        }

        // STEP 3: Store the complete assessment in the same report.
        report.analysis.status = 'completed';
        report.analysis.priority =
          aiResult.assessment.priority || null;
        report.analysis.assessment = aiResult.assessment;
        report.analysis.provider = aiResult.provider || null;
        report.analysis.model = aiResult.model || null;
        report.analysis.assessedAt = new Date();
        report.analysis.error = null;

        await report.save();

        console.log(`AI assessment completed for report ${report._id}`);

      } catch (aiError) {
        // AI failure must not prevent the report from being submitted.
        console.error('AI assessment failed:', aiError.message);

        report.analysis.status = 'failed';
        report.analysis.error = aiError.message;

        await report.save();
      }
    }

    // STEP 4: Notify the resident that their report was received.
    await notifyReportOwner(report, {
      title: 'Report submitted',
      body: `Your ${report.category} report has been received successfully.`,
      data: {
        type: 'report_submitted',
        reportId: report._id.toString(),
      },
    });

    // STEP 5: Return the saved report, including its AI assessment.
    return res.status(201).json({
      success: true,
      message: 'Report received successfully.',
      report: formatReport(report),
    });

  } catch (error) {
    console.error('Error saving report:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to save report.',
    });
  }
});




// Retrieve limited municipal report information for the map
app.get('/api/reports/map', authMiddleware, async (req, res) => {
  try {
    const reports = await Report.find({
      submissionStatus: { $ne: 'resolved' },
    })
      .select('category submissionStatus location')
      .sort({ createdAt: -1 })
      .lean();

    const mapReports = reports
      .filter((report) => {
        const latitude = Number(report.location?.latitude);
        const longitude = Number(report.location?.longitude);

        return (
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          latitude >= -90 &&
          latitude <= 90 &&
          longitude >= -180 &&
          longitude <= 180
        );
      })
      .map((report) => ({
        category: report.category,
        submissionStatus: report.submissionStatus || 'received',
        location: {
          // Approximate coordinates to protect residents' privacy.
          latitude: Number(report.location.latitude),
          longitude: Number(report.location.longitude),
        },
      }));

    return res.json({
      success: true,
      count: mapReports.length,
      reports: mapReports,
    });

  } catch (error) {
    console.error('Error retrieving map reports:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to retrieve map reports.',
    });
  }
});



// Retrieve complete reports, including AI assessments, for administrators
app.get(
  '/api/admin/reports',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const reports = await Report.find()
        .sort({ createdAt: -1 });

      return res.json({
        success: true,
        count: reports.length,
        reports: reports.map(formatReport),
      });

    } catch (error) {
      console.error('Error retrieving admin reports:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to retrieve administrator reports.',
      });
    }
  }
);



app.get('/api/reports/my-reports', authMiddleware, async (req, res) => {
  try {
    const reports = await Report.find({
      user: req.user.id,
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: reports.length,
      reports: reports.map(formatReport),
    });

  } catch (error) {
    console.error('Error retrieving resident reports:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to retrieve your reports.',
    });
  }
});


// Update a report's submission status

app.patch(
  '/api/reports/:id/status',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { submissionStatus } = req.body;

      const allowedStatuses = [
        'received',
        'under_review',
        'in_progress',
        'resolved',
      ];

      // Validate the status.
      if (!allowedStatuses.includes(submissionStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid report status.',
        });
      }

      // Validate the MongoDB report ID.
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid report ID.',
        });
      }

      const updatedReport = await Report.findById(id);

      if (!updatedReport) {
        return res.status(404).json({
          success: false,
          message: 'Report not found.',
        });
      }

      const previousStatus = updatedReport.submissionStatus;

      // Update and save the report.
      updatedReport.submissionStatus = submissionStatus;
      await updatedReport.save();

      // Notify the resident only if the status actually changed.
      if (previousStatus !== submissionStatus) {
        await notifyReportOwner(updatedReport, {
          title: 'Report status updated',
          body: `Your ${updatedReport.category} report is now ${submissionStatus.replace(/_/g, ' ')}.`,
          data: {
            type: 'report_status_updated',
            reportId: updatedReport._id.toString(),
            submissionStatus,
          },
        });
      }

      return res.json({
        success: true,
        message: 'Report status updated successfully.',
        report: formatReport(updatedReport),
      });

    } catch (error) {
      console.error('Error updating report status:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to update report status.',
      });
    }
  }
);

// Reject a report and notify the resident
app.patch(
  '/api/reports/:id/reject',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid report ID.',
        });
      }

      if (
        typeof reason !== 'string' ||
        reason.trim().length < 5
      ) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a rejection reason of at least 5 characters.',
        });
      }

      const report = await Report.findById(id);

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found.',
        });
      }

      if (
        report.submissionStatus === 'resolved' ||
        report.submissionStatus === 'rejected'
      ) {
        return res.status(400).json({
          success: false,
          message: 'This report has already been resolved or rejected.',
        });
      }

      report.submissionStatus = 'rejected';
      report.rejectionReason = reason.trim();
      report.rejectedBy = req.user.id;
      report.rejectedAt = new Date();

      await report.save();

      // Notify the resident without exposing the administrator's identity.
      await notifyReportOwner(report, {
        title: 'Report not accepted',
        body: `Your ${report.category} report was not accepted. Open CivicPulse to view the reason.`,
        data: {
          type: 'report_rejected',
          reportId: report._id.toString(),
        },
      });

      return res.json({
        success: true,
        message: 'Report rejected successfully.',
        report: formatReport(report),
      });

    } catch (error) {
      console.error('Error rejecting report:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to reject report.',
      });
    }
  }
);


// Save the administrator's final priority decision
app.patch(
  '/api/reports/:id/admin-decision',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { decision, priority, reason } = req.body;

      const allowedPriorities = ['low', 'medium', 'high'];
      const allowedDecisions = ['accepted', 'overridden'];

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid report ID.',
        });
      }

      if (!allowedDecisions.includes(decision)) {
        return res.status(400).json({
          success: false,
          message: 'Choose whether to accept or override the AI recommendation.',
        });
      }

      const report = await Report.findById(id);

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found.',
        });
      }

      let finalPriority;

      if (decision === 'accepted') {
        const aiPriority = report.analysis?.priority;

        if (!allowedPriorities.includes(aiPriority)) {
          return res.status(400).json({
            success: false,
            message: 'This AI assessment has no usable priority to accept. Please override it.',
          });
        }

        finalPriority = aiPriority;
      } else {
        if (!allowedPriorities.includes(priority)) {
          return res.status(400).json({
            success: false,
            message: 'Select a valid final priority.',
          });
        }

        if (typeof reason !== 'string' || !reason.trim()) {
          return res.status(400).json({
            success: false,
            message: 'Please provide a reason for overriding the AI recommendation.',
          });
        }

        finalPriority = priority;
      }

      report.adminDecision = {
        priority: finalPriority,
        decision,
        reason: decision === 'overridden' ? reason.trim() : '',
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      };

      await report.save();

      return res.json({
        success: true,
        message: 'Administrator decision saved successfully.',
        report: formatReport(report),
      });

    } catch (error) {
      console.error('Admin decision error:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to save administrator decision.',
      });
    }
  }
);

// Connect to MongoDB before starting the API
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('Connected to CivicPulse MongoDB successfully!');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`CivicPulse API running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });

  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

startServer();
