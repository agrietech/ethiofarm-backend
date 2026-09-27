const alertTargetingService = require('../targeting/alert-targeting.service');
const { BadRequestError } = require('../../../utils/errors');

class AlertTemplatesService {
  templates = {
    DROUGHT_WARNING: {
      id: 'DROUGHT_WARNING',
      hazardType: 'DROUGHT',
      titleEn: 'Drought Warning - Water Conservation Required',
      titleAm: 'የድርቅ ማስጠንቀቂያ - የውሃ ቆጠባ ያስፈልጋል',
      messageEn: 'Low rainfall expected in the coming weeks. Implement water conservation measures immediately.',
      messageAm: 'በሚቀጥሉት ሳምንታት ዝቅተኛ ዝናብ ይጠበቃል። የውሃ ቆጠባ እርምጃዎችን ወዲያውኑ ይተግብሩ።',
      severity: 'HIGH',
      channels: ['SMS', 'PUSH_NOTIFICATION', 'USSD']
    },

    FROST_ALERT: {
      id: 'FROST_ALERT',
      hazardType: 'FROST',
      titleEn: 'Frost Alert - Protect Crops Tonight',
      titleAm: 'የበረዶ ማስጠንቀቂያ - ዛሬ ማታ ሰብሎችን ይጠብቁ',
      messageEn: 'Temperature expected to drop to {temp}°C tonight. Cover sensitive crops and seedlings.',
      messageAm: 'የሙቀት መጠን ዛሬ ማታ ወደ {temp}°ሴ እንደሚወርድ ይጠበቃል። ሰብሎችን እና ችግኞችን ይሸፍኑ።',
      severity: 'CRITICAL',
      channels: ['SMS', 'PUSH_NOTIFICATION']
    },

    LOCUST_WARNING: {
      id: 'LOCUST_WARNING',
      hazardType: 'LOCUST_PEST',
      titleEn: 'Locust Swarm Detected - Immediate Action Required',
      titleAm: 'የአንበጣ መንጋ ታይቷል - አስቸኳይ እርምጃ ያስፈልጋል',
      messageEn: 'Desert locust swarm spotted {distance}km from your area. Report sightings immediately.',
      messageAm: 'የበረሃ አንበጣ መንጋ ከእርስዎ አካባቢ {distance}ኪ.ሜ ርቀት ላይ ታይቷል። ወዲያውኑ ይጠቁሙ።',
      severity: 'CRITICAL',
      channels: ['SMS', 'PUSH_NOTIFICATION', 'USSD']
    },

    HEAVY_RAIN_FLOOD: {
      id: 'HEAVY_RAIN_FLOOD',
      hazardType: 'FLOOD',
      titleEn: 'Heavy Rainfall Alert - Flood Risk',
      titleAm: 'ከባድ ዝናብ ማስጠንቀቂያ - የጎርፍ አደጋ',
      messageEn: '{rainfall}mm rainfall expected in next 48 hours. Prepare drainage and protect low-lying fields.',
      messageAm: 'በሚቀጥሉት 48 ሰዓታት {rainfall}ሚ.ሜ ዝናብ ይጠበቃል። የውሃ መውረጃ ይዘጋጁ እና ዝቅተኛ ቦታዎችን ይጠብቁ።',
      severity: 'HIGH',
      channels: ['SMS', 'PUSH_NOTIFICATION']
    },

    HEAT_STRESS: {
      id: 'HEAT_STRESS',
      hazardType: 'HEAT_STRESS',
      titleEn: 'Heat Wave Alert',
      titleAm: 'የሙቀት ማዕበል ማስጠንቀቂያ',
      messageEn: 'Extreme heat expected. Increase irrigation frequency and provide shade for livestock.',
      messageAm: 'ከፍተኛ ሙቀት ይጠበቃል። የመስኖ ድግግሞሽ ይጨምሩ እና ለእንስሳት ጥላ ያቅርቡ።',
      severity: 'MODERATE',
      channels: ['SMS', 'PUSH_NOTIFICATION']
    }
  };

  /**
   * Create alert from template
   */
  async createFromTemplate(templateId, variables = {}, targeting = {}) {
    const template = this.templates[templateId];
    
    if (!template) {
      throw new BadRequestError(`Template ${templateId} not found`);
    }

    // Replace variables in messages
    let messageEn = template.messageEn;
    let messageAm = template.messageAm;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{${key}\\}`, 'g');
      messageEn = messageEn.replace(placeholder, value);
      messageAm = messageAm.replace(placeholder, value);
    }

    // Create targeted alert
    return await alertTargetingService.createTargetedAlert({
      woredaId: targeting.woredaId,
      hazardType: template.hazardType,
      severity: template.severity,
      content: {
        titleEn: template.titleEn,
        titleAm: template.titleAm,
        messageEn,
        messageAm
      },
      targeting,
      delivery: {
        channels: template.channels
      }
    });
  }

  /**
   * Get all templates
   */
  getAllTemplates() {
    return Object.values(this.templates);
  }

  /**
   * Get template by ID
   */
  getTemplate(id) {
    return this.templates[id] || null;
  }

  /**
   * Get templates by hazard type
   */
  getTemplatesByHazardType(hazardType) {
    return Object.values(this.templates).filter(
      t => t.hazardType === hazardType
    );
  }
}

module.exports = new AlertTemplatesService();
