const { prisma } = require('../../../config/db');
const { BadRequestError } = require('../../../utils/errors');
const logger = require('../../../utils/logger');

class AlertTargetingService {
  /**
   * Create targeted alert campaign
   */
  async createTargetedAlert({ woredaId, hazardType, severity, content, targeting, schedule, delivery }) {
    // Build audience based on targeting criteria
    const audience = await this.buildAudience(woredaId, targeting);

    if (audience.length === 0) {
      throw new BadRequestError('No users match the targeting criteria');
    }

    // Create alert campaign
    const campaign = await prisma.alertCampaign.create({
      data: {
        woredaId,
        hazardType,
        severity,
        titleEn: content.titleEn,
        titleAm: content.titleAm,
        titleOm: content.titleOm || null,
        messageEn: content.messageEn,
        messageAm: content.messageAm,
        messageOm: content.messageOm || null,
        targeting: targeting || {},
        audienceSize: audience.length,
        scheduledFor: schedule?.sendAt || new Date(),
        status: schedule?.sendAt ? 'SCHEDULED' : 'ACTIVE',
        deliveryChannels: delivery?.channels || ['SMS', 'PUSH_NOTIFICATION']
      }
    });

    // Dispatch immediately or schedule
    if (!schedule?.sendAt) {
      await this.dispatchCampaign(campaign.id, audience);
    }

    logger.info(`[AlertTargeting] Campaign created: ${campaign.id}, Audience: ${audience.length}`);

    return {
      campaignId: campaign.id,
      audienceSize: audience.length,
      status: campaign.status
    };
  }

  /**
   * Build targeted audience based on criteria
   */
  async buildAudience(woredaId, targeting = {}) {
    const filters = { woredaId };

    // Target by crop type
    if (targeting.crops && targeting.crops.length > 0) {
      filters.farms = {
        some: { primaryCrop: { in: targeting.crops } }
      };
    }

    // Target by farm size
    if (targeting.farmSize) {
      filters.farms = {
        ...filters.farms,
        some: {
          ...filters.farms?.some,
          areaHectares: {
            gte: targeting.farmSize.min || 0,
            lte: targeting.farmSize.max || 999
          }
        }
      };
    }

    // Target by role
    if (targeting.roles && targeting.roles.length > 0) {
      filters.role = { in: targeting.roles };
    } else {
      // Default to farmers only
      filters.role = 'FARMER';
    }

    // Target by language
    if (targeting.language) {
      filters.preferredLang = targeting.language;
    }

    // Target specific users
    if (targeting.userIds && targeting.userIds.length > 0) {
      filters.id = { in: targeting.userIds };
    }

    const users = await prisma.user.findMany({
      where: filters,
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        fcmToken: true,
        preferredLang: true
      }
    });

    return users;
  }

  /**
   * Dispatch campaign to audience
   */
  async dispatchCampaign(campaignId, audience) {
    const campaign = await prisma.alertCampaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      throw new BadRequestError('Campaign not found');
    }

    // Create delivery logs
    const deliveryLogs = audience.map(user => ({
      campaignId,
      userId: user.id,
      channel: 'SMS', // Primary channel
      status: 'PENDING'
    }));

    await prisma.campaignDeliveryLog.createMany({
      data: deliveryLogs
    });

    // Update campaign status
    await prisma.alertCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'DISPATCHED',
        dispatchedAt: new Date()
      }
    });

    // Dispatch via channels (async)
    this.sendToChannels(campaign, audience).catch(err => {
      logger.error(`[AlertTargeting] Dispatch error: ${err.message}`);
    });

    logger.info(`[AlertTargeting] Campaign ${campaignId} dispatched to ${audience.length} users`);
  }

  /**
   * Send alerts via multiple channels
   */
  async sendToChannels(campaign, audience) {
    const { dispatchHazardAlertSms } = require('../../../delivery/sms/smsDispatcher');
    const { sendPushNotification } = require('../../../delivery/push/fcmDispatcher');

    // SMS dispatch
    if (campaign.deliveryChannels.includes('SMS')) {
      const phoneNumbers = audience.map(u => u.phoneNumber).filter(Boolean);
      if (phoneNumbers.length > 0) {
        try {
          await dispatchHazardAlertSms({
            phoneNumbers,
            hazardType: campaign.hazardType,
            woredaName: campaign.woreda?.nameEn || 'your area',
            severity: campaign.severity
          });
        } catch (err) {
          logger.error(`[AlertTargeting] SMS dispatch failed: ${err.message}`);
        }
      }
    }

    // Push notification dispatch
    if (campaign.deliveryChannels.includes('PUSH_NOTIFICATION')) {
      try {
        await sendPushNotification({
          topic: `woreda_${campaign.woredaId}`,
          title: campaign.titleAm || campaign.titleEn,
          body: campaign.messageAm || campaign.messageEn,
          data: {
            campaignId: campaign.id,
            hazardType: campaign.hazardType,
            severity: campaign.severity
          }
        });
      } catch (err) {
        logger.error(`[AlertTargeting] Push notification failed: ${err.message}`);
      }
    }
  }
}

module.exports = new AlertTargetingService();
