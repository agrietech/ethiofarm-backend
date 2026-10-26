const diseaseService = require('./diseaseDiagnosis.service');

async function diagnose(req, res, next) {
  try {
    const { farmId, cropType, cropHint, imageUrl, imageBase64, image, language, async: isAsync } = req.body;
    const resolvedCrop = cropType || cropHint || undefined;
    const lang = language || req.query.lang || req.user?.preferredLang || 'en';
    const imageFile = req.file || null;
    const resolvedBase64 = imageBase64 || image || null;

    // Support async job mode when requested (e.g. ?async=true or body.async=true)
    const shouldRunAsync = isAsync === true || isAsync === 'true' || req.query.async === 'true';

    if (shouldRunAsync) {
      const job = await diseaseService.submitAsyncDiagnosis({
        farmId,
        cropType: resolvedCrop,
        imageUrl,
        imageFile,
        imageBase64: resolvedBase64,
        language: lang,
        user: req.user,
      });
      return res.status(202).json({ success: true, data: job });
    }

    const data = await diseaseService.diagnoseCropImage({
      farmId,
      cropType: resolvedCrop,
      imageUrl,
      imageFile,
      imageBase64: resolvedBase64,
      language: lang,
      user: req.user,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getJobStatus(req, res, next) {
  try {
    const { jobId } = req.params;
    const job = await diseaseService.getDiagnosisJobStatus(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: { message: `Diagnosis job '${jobId}' not found`, code: 'JOB_NOT_FOUND' },
      });
    }
    return res.status(200).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
}

async function getAllDiagnoses(req, res, next) {
  try {
    const { farmId, cropType } = req.query;
    const data = await diseaseService.getAllDiagnoses({ farmId, cropType, user: req.user });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getDiagnosesByFarm(req, res, next) {
  try {
    const data = await diseaseService.getDiagnosesByFarm(req.params.farmId, req.user);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getDiagnosisById(req, res, next) {
  try {
    const data = await diseaseService.getDiagnosisById(req.params.id, req.user);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function escalate(req, res, next) {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const data = await diseaseService.escalateDiagnosis(id, notes, req.user);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  diagnose,
  getJobStatus,
  getAllDiagnoses,
  getDiagnosesByFarm,
  getDiagnosisById,
  escalate,
};

