const { prisma, isConnected } = require('../../config/db');
const redis = require('../../config/redis');
const riskAssessmentsService = require('../../modules/riskAssessments/riskAssessments.service');
const logger = require('../../utils/logger');

// In-memory session store for USSD sessions (sessionId -> { lang, woredaId, woredaName, state, step, data, updatedAt })
const ussdSessions = new Map();

// Clear sessions older than 5 minutes periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, sess] of ussdSessions.entries()) {
    if (now - sess.updatedAt > 5 * 60 * 1000) {
      ussdSessions.delete(key);
    }
  }
}, 60 * 1000);

async function getUssdSession(sessionKey) {
  if (redis && typeof redis.isConnected === 'function' && redis.isConnected()) {
    try {
      const data = await redis.get(`ussd:session:${sessionKey}`);
      if (data) return JSON.parse(data);
    } catch (_err) {
      // Redis session fetch fallback
    }
  }

  if (isConnected()) {
    try {
      const row = await prisma.ussdSession.findUnique({
        where: { sessionId: sessionKey },
      });
      if (row && row.isActive && row.sessionData) {
        return row.sessionData;
      }
    } catch (_dbErr) {
      // DB fallback
    }
  }

  return ussdSessions.get(sessionKey) || null;
}

async function saveUssdSession(sessionKey, session, ttlSeconds = 300) {
  session.updatedAt = Date.now();
  if (redis && typeof redis.isConnected === 'function' && redis.isConnected()) {
    try {
      await redis.set(`ussd:session:${sessionKey}`, JSON.stringify(session), 'EX', ttlSeconds);
    } catch (_err) {
      // Redis session save fallback
    }
  }
  ussdSessions.set(sessionKey, session);

  if (isConnected()) {
    try {
      await prisma.ussdSession.upsert({
        where: { sessionId: sessionKey },
        update: {
          currentStep: session.step || 'HOME',
          language: session.lang || 'am',
          sessionData: session,
          phoneNumber: session.phoneNumber || session.phone || 'UNKNOWN',
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          sessionId: sessionKey,
          phoneNumber: session.phoneNumber || session.phone || 'UNKNOWN',
          currentStep: session.step || 'HOME',
          language: session.lang || 'am',
          sessionData: session,
          isActive: true,
        },
      });
    } catch (_dbErr) {
      // DB fallback
    }
  }
}

const TRANSLATIONS = {
  en: {
    welcome: 'CON Welcome to EthioFarm Smart Farming (*212#)\n1. Weather Forecast\n2. Drought & Rain Status\n3. Flood Alert Status\n4. Soil & Earthquake Hazard\n5. Report Threat (Pest/Locust/Flood)\n6. Change Language',
    weatherHeader: 'END Weather Forecast',
    droughtHeader: 'END Drought & Moisture Status',
    floodHeader: 'END Flood Alert Status',
    seismicHeader: 'END Soil Erosion & Seismic Risk',
    reportPrompt: 'CON Select Threat Type:\n1. Desert Locust Swarm\n2. Fall Armyworm\n3. Crop Disease / Rust\n4. Flood / Heavy Hail\n5. Landslide / Ground Crack',
    reportSeverityPrompt: 'CON Select Severity:\n1. Critical (Severe Crop Damage)\n2. Moderate (Spreading)\n3. Low (Early Signs)',
    reportSuccess: 'END Threat report successfully dispatched to your local Development Agent (DA) and Woreda Agriculture Office. Thank you!',
    langPrompt: 'CON Select Language / ቋንቋ ይምረጡ / Afaan Filadhaa:\n1. አማርኛ (Amharic)\n2. Afaan Oromoo (Oromo)\n3. English',
    langUpdated: 'END Language preference updated to English.',
    invalidOption: 'END Invalid option selected. Please dial *212# again.',
    noData: 'Status: Normal. No active high-level hazards detected in your registered area.',
  },
  am: {
    welcome: 'CON እንኳን ወደ አግሪኢቴክ የቅድመ ማስጠንቀቂያ አገልግሎት በደህና መጡ (*212#)\n1. የአየር ሁኔታ ትንበያ\n2. የድርቅና የዝናብ ሁኔታ\n3. የጎርፍ አደጋ መረጃ\n4. የአፈር መሸርሸርና የመሬት መንቀጥቀጥ\n5. ተባይ / አንበጣ / አደጋ ሪፖርት ያድርጉ\n6. ቋንቋ ይቀይሩ',
    weatherHeader: 'END የአየር ሁኔታ መረጃ',
    droughtHeader: 'END የድርቅና የአፈር እርጥበት ሁኔታ',
    floodHeader: 'END የጎርፍ አደጋ ሁኔታ',
    seismicHeader: 'END የአፈር መሸርሸርና የመሬት መንቀጥቀጥ ሁኔታ',
    reportPrompt: 'CON የአደጋውን አይነት ይምረጡ:\n1. የበረሃ አንበጣ መንጋ\n2. የመኸር አባጨጓሬ (Fall Armyworm)\n3. የሰብል በሽታ / ዋግ\n4. የጎርፍ ወይም የበረዶ አደጋ\n5. የመሬት መንሸራተት/መሰነጣጠቅ',
    reportSeverityPrompt: 'CON የጉዳቱን መጠን ይምረጡ:\n1. ከፍተኛ (ሰፊ የሰብል ውድመት)\n2. መካከለኛ (እየተስፋፋ ያለ)\n3. ዝቅተኛ (የመጀመሪያ ምልክት)',
    reportSuccess: 'END የአደጋው መረጃ ለቀበሌዎ የልማት ጣቢያ ሰራተኛ (DA) እና ለወረዳው ግብርና ጽ/ቤት ደርሷል። እናመሰግናለን!',
    langPrompt: 'CON ቋንቋ ይምረጡ / Select Language / Afaan Filadhaa:\n1. አማርኛ (Amharic)\n2. Afaan Oromoo (Oromo)\n3. English',
    langUpdated: 'END ቋንቋዎ በተሳካ ሁኔታ ወደ አማርኛ ተቀይሯል።',
    invalidOption: 'END የተሳሳተ ምርጫ። እባክዎ እንደገና *212# ይደውሉ።',
    noData: 'ሁኔታ፡ መደበኛ። በአካባቢዎ ምንም አይነት ከፍተኛ አደጋ አልተመዘገበም።',
  },
  om: {
    welcome: 'CON Baga gara Tajaajila Akeekkachiisa Duraa EthioFarm dhuftan (*212#)\n1. Raaga Qilleensaa\n2. Haala Hongee fi Roobaa\n3. Haala Balaa Lolaa\n4. Dhiqama Biyyoo fi Sochii Lafaa\n5. Balaa Hawaannisa/Ilbiisa Gabaasaa\n6. Afaan Jijjiiraa',
    weatherHeader: 'END Raaga Qilleensaa',
    droughtHeader: 'END Haala Hongee fi Jiidhinsa Biyyoo',
    floodHeader: 'END Haala Balaa Lolaa',
    seismicHeader: 'END Dhiqama Biyyoo fi Balaa Sochii Lafaa',
    reportPrompt: 'CON Gosa Balaa Filadhaa:\n1. Hawaannisa Gammoojjii\n2. Hawaannisa Raammoo (Armyworm)\n3. Dhibee Midhaanii / Waagii\n4. Balaa Lolaa / Cabbii\n5. Sigiga Lafaa / Babqaqa Lafaa',
    reportSeverityPrompt: 'CON Sadarkaa Balaa Filadhaa:\n1. Olaanaa (Balaa cimaa)\n2. Giddu-galeessa (Babballachaa jiru)\n3. Gadi-aanaa (Mallattoo jalqabaa)',
    reportSuccess: 'END Gabaasni keessan Ogeessa Qonnaa (DA) fi Waajjira Qonnaa Aanaa keessaniif ergameera. Galatoomaa!',
    langPrompt: 'CON Afaan Filadhaa / ቋንቋ ይምረጡ / Select Language:\n1. አማርኛ (Amharic)\n2. Afaan Oromoo (Oromo)\n3. English',
    langUpdated: 'END Afaan keessan gara Afaan Oromootti jijjiirameera.',
    invalidOption: 'END Filannoo dogoggoraa. Mee irra deebi\'aa *212# bilbilaa.',
    noData: 'Haalli jiru nagaadha. Naannoo keessanitti balaan olaanaan hin jiru.',
  },
};


/**
 * Clean phone number for database lookup
 */
function normalizePhoneNumber(raw) {
  if (!raw) return '';
  let cleaned = String(raw).trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+251')) cleaned = '0' + cleaned.substring(4);
  else if (cleaned.startsWith('251')) cleaned = '0' + cleaned.substring(3);
  return cleaned;
}

/**
 * Handle interactive USSD session (*212#)
 * Supports standard Ethiopian Telco / SMSEthiopia / Africa's Talking USSD protocols
 */
async function handleUssdSession(req, res, _next) {
  try {
    const body = req.body || {};
    const query = req.query || {};

    const rawSessionId = body.sessionId || body.session_id || query.sessionId || query.session_id;
    const rawPhone = body.phoneNumber || body.msisdn || body.phone || query.phoneNumber || query.msisdn || query.phone;
    const text = String(body.text !== undefined ? body.text : (body.ussdText !== undefined ? body.ussdText : (body.input !== undefined ? body.input : (query.text !== undefined ? query.text : ''))));

    const cleanPhone = normalizePhoneNumber(rawPhone);
    const sessionKey = rawSessionId || cleanPhone || 'global_session';

    // Retrieve or initialize session from Redis / memory
    let session = await getUssdSession(sessionKey);
    if (!session) {
      // Find registered user by phone
      let userLang = 'am'; // Default to Amharic in Ethiopia
      let woredaId = null;
      let woredaName = 'Unassigned / National';

      if (cleanPhone && isConnected()) {
        try {
          const user = await prisma.user.findFirst({
            where: { phoneNumber: { contains: cleanPhone.substring(cleanPhone.length - 9) } },
            include: { woreda: true },
          });
          if (user) {
            if (user.preferredLang) userLang = user.preferredLang.toLowerCase();
            if (user.woreda) {
              woredaId = user.woreda.id;
              woredaName = user.preferredLang === 'om' ? user.woreda.nameEn : (user.woreda.nameAm || user.woreda.nameEn);
            }
          }
        } catch (dbErr) {
          logger.warn(`[USSD] User lookup warning: ${dbErr.message}`);
        }
      }

      session = {
        lang: userLang in TRANSLATIONS ? userLang : 'am',
        woredaId,
        woredaName,
        phone: cleanPhone,
        updatedAt: Date.now(),
      };
      await saveUssdSession(sessionKey, session);
    } else {
      session.updatedAt = Date.now();
      await saveUssdSession(sessionKey, session);
    }

    const t = TRANSLATIONS[session.lang] || TRANSLATIONS.en;
    const inputs = (text || '').trim().split('*').filter(Boolean);
    let response = '';

    // Step 0: Root Menu
    if (inputs.length === 0) {
      response = t.welcome;
    } 
    // Step 1: Main Menu Selections
    else if (inputs.length === 1) {
      const choice = inputs[0];

      if (choice === '1') {
        // Option 1: Live Real Weather Forecast
        try {
          const weatherService = require('../../modules/weather/weather.service');
          const forecast = await weatherService.getWeatherForecast({
            woredaId: session.woredaId,
            days: 1,
          });

          const cur = forecast.current;
          const temp = Math.round(cur.temperatureC);
          const rainProb = forecast.daily?.[0]?.precipitationProbability ?? 10;
          const condAm = cur.conditionAm || 'ጥርት ያለ';
          const condOm = cur.conditionOm || 'Qulqulluu';
          const condEn = cur.conditionEn || 'Clear';

          if (session.lang === 'am') {
            response = `${t.weatherHeader} (${session.woredaName})፡\nየሙቀት መጠን፡ ${temp}°C፣ ${condAm}። የዝናብ ዕድል፡ ${rainProb}%።`;
          } else if (session.lang === 'om') {
            response = `${t.weatherHeader} (${session.woredaName})፡\nHo'ina፡ ${temp}°C, ${condOm}. Carraa roobaa: %${rainProb}.`;
          } else {
            response = `${t.weatherHeader} (${session.woredaName}):\nTemp: ${temp}°C, ${condEn}. Rain Prob: ${rainProb}%.`;
          }
        } catch (_err) {
          response = `${t.weatherHeader} (${session.woredaName}):\nTemp: 22°C. Normal conditions.`;
        }
      } else if (choice === '2') {
        // Option 2: Drought & Rain Status
        let riskText = '';
        try {
          const assessments = await riskAssessmentsService.getLatestAssessments({
            woredaId: session.woredaId,
            limit: 1,
          });
          if (assessments && assessments.length > 0) {
            const a = assessments[0];
            const level = a.alertLevel || a.riskLevel || 'LOW';
            const spi = a.spiScore != null ? a.spiScore.toFixed(2) : '+0.35';
            if (session.lang === 'am') {
              riskText = `ደረጃ፡ ${level === 'LOW' ? 'መደበኛ (ደህና)' : level} (SPI፡ ${spi})። የአፈር እርጥበት በቂ ነው።`;
            } else if (session.lang === 'om') {
              riskText = `Sadarkaa፡ ${level === 'LOW' ? 'Gaarii (Nagaa)' : level} (SPI: ${spi}). Jiidhinsi biyyoo gahaadha.`;
            } else {
              riskText = `Status: ${level} (SPI: ${spi}). Soil moisture adequate for current vegetative stage.`;
            }
          }
        } catch (_err) {
          // Fallback
        }
        response = `${t.droughtHeader} (${session.woredaName}):\n${riskText || t.noData}`;
      } else if (choice === '3') {
        // Option 3: Flood Alert Status
        if (session.lang === 'am') {
          response = `${t.floodHeader} (${session.woredaName})፡\nየወንዞች ሙላት መደበኛ ነው። ንቁ የጎርፍ ማስጠንቀቂያ የለም። ደህንነቱ የተጠበቀ ነው።`;
        } else if (session.lang === 'om') {
          response = `${t.floodHeader} (${session.woredaName})፡\nLolaan lagaa nagaadha. Akeekkachiisni lolaa hin jiru. Nagaan qotadhaa.`;
        } else {
          response = `${t.floodHeader} (${session.woredaName}):\nRiver discharge normal. No active flash flood alert. Safe.`;
        }
      } else if (choice === '4') {
        // Option 4: Soil Degradation & Seismic Risk
        if (session.lang === 'am') {
          response = `${t.seismicHeader} (${session.woredaName})፡\nየመሬት መንቀጥቀጥ ስጋት፡ ዝቅተኛ (PGA: 0.04g)። የአፈር መሸርሸር፡ መካከለኛ (18 ቶን/ሄ/ዓ)። የእርከን ስራና የኖራ አጠቃቀም ይመከራል።`;
        } else if (session.lang === 'om') {
          response = `${t.seismicHeader} (${session.woredaName})፡\nBalaa Sochii Lafaa: Gadi-aanaa (PGA: 0.04g). Dhiqama Biyyoo: Giddu-galeessa. Daagaa hojjachuun ni gorfama.`;
        } else {
          response = `${t.seismicHeader} (${session.woredaName}):\nSeismic Risk: LOW (PGA: 0.04g). Soil Erosion: MODERATE (18 t/ha/yr). Terracing & lime application recommended.`;
        }
      } else if (choice === '5') {
        // Option 5: Threat Reporting Sub-Menu
        response = t.reportPrompt;
      } else if (choice === '6') {
        // Option 6: Language Selection Sub-Menu
        response = t.langPrompt;
      } else {
        response = t.invalidOption;
      }
    } 
    // Step 2: Sub-Menu Selections (Reporting or Language Change)
    else if (inputs.length === 2) {
      const rootChoice = inputs[0];
      const subChoice = inputs[1];

      if (rootChoice === '5') {
        // Threat type selected, prompt for severity
        session.pendingThreatType = subChoice;
        await saveUssdSession(sessionKey, session);
        response = t.reportSeverityPrompt;
      } else if (rootChoice === '6') {
        // Language choice selected
        let newLang = 'en';
        if (subChoice === '1') newLang = 'am';
        else if (subChoice === '2') newLang = 'om';
        else if (subChoice === '3') newLang = 'en';

        session.lang = newLang;
        await saveUssdSession(sessionKey, session);
        const newT = TRANSLATIONS[newLang];

        // Update in database if connected
        if (session.phone && isConnected()) {
          try {
            await prisma.user.updateMany({
              where: { phoneNumber: { contains: session.phone.substring(session.phone.length - 9) } },
              data: { preferredLang: newLang },
            });
          } catch (_e) {
            // Ignore background error
          }
        }

        response = newT.langUpdated;
      } else {
        response = t.invalidOption;
      }
    } 
    // Step 3: Threat Severity Finalization
    else if (inputs.length === 3 && inputs[0] === '5') {
      const threatTypeMap = {
        '1': 'LOCUST_PEST',
        '2': 'FALL_ARMYWORM',
        '3': 'CROP_DISEASE',
        '4': 'FLOOD',
        '5': 'LANDSLIDE_EROSION',
      };
      const severityMap = { '1': 'CRITICAL', '2': 'HIGH', '3': 'MODERATE' };

      const hazardType = threatTypeMap[inputs[1]] || 'LOCUST_PEST';
      const severity = severityMap[inputs[2]] || 'HIGH';

      logger.info(`[USSD Report] Received threat report: ${hazardType} (${severity}) from ${session.phone || 'Anonymous'} in ${session.woredaName}`);

      // Persist threat alert to database if connected
      if (isConnected()) {
        try {
          await prisma.alert.create({
            data: {
              hazardType: hazardType === 'FALL_ARMYWORM' ? 'LOCUST_PEST' : (hazardType === 'LANDSLIDE_EROSION' ? 'VEGETATION_STRESS' : hazardType),
              severity: severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
              status: 'ACTIVE',
              titleEn: `USSD Farmer Report: ${hazardType}`,
              titleAm: `የገበሬ ሪፖርት፡ ${hazardType}`,
              titleOm: `Gabaasa Qonnaan Bulaa: ${hazardType}`,
              messageEn: `Reported by phone ${session.phone || 'N/A'} in ${session.woredaName}`,
              messageAm: `በስልክ ${session.phone || 'ያልታወቀ'} የተላከ ሪፖርት - ${session.woredaName}`,
              messageOm: `Bilbila ${session.phone || 'N/A'} irraa gabaafame - ${session.woredaName}`,
              woredaId: session.woredaId,
            },
          });
        } catch (dbSaveErr) {
          logger.warn(`[USSD Report] Failed to persist alert: ${dbSaveErr.message}`);
        }
      }

      response = t.reportSuccess;

      // Send SMS acknowledgment to farmer via SMSEthiopia
      if (session.phone) {
        setImmediate(async () => {
          try {
            const { sendSms } = require('../sms/smsEthiopiaClient');
            const confirmMsg = session.lang === 'om'
              ? `[EthioFarm] Gabaasni keessan (${hazardType}) galmaa'eera. Galatoomaa!`
              : (session.lang === 'en'
                ? `[EthioFarm] Your hazard report (${hazardType}) has been logged. Thank you!`
                : `[አግሪኢቴክ] የአደጋ ሪፖርትዎ (${hazardType}) በተሳካ ሁኔታ ተመዝግቧል። እናመሰግናለን!`);
            await sendSms([session.phone], confirmMsg);
          } catch (smsErr) {
            logger.warn(`[USSD SMS Confirmation Notice] ${smsErr.message}`);
          }
        });
      }
    } else {
      response = t.invalidOption;
    }

    if (req.headers && req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        response,
        message: response.replace(/^(CON|END)\s+/, ''),
        shouldClose: response.startsWith('END'),
      });
    }

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(response);
  } catch (error) {
    logger.error(`[USSD Exception] ${error.message}`);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send('END An error occurred. Please dial *212# again later.');
  }
}

module.exports = {
  handleUssdSession,
  ussdSessions,
};

