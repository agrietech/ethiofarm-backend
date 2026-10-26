const {
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendEmergencyHazardAlertEmail,
  getSentEmailsLog,
  clearSentEmailsLog,
} = require("../../src/delivery/email/emailDispatcher");

describe("Professional Email Dispatcher Suite", () => {
  beforeEach(() => {
    clearSentEmailsLog();
  });

  describe("sendVerificationEmail", () => {
    it("generates professional HTML email with verification token and CTA button", async () => {
      const res = await sendVerificationEmail("farmer@example.com", "tok_verify_123");
      expect(res.success).toBe(true);

      const log = getSentEmailsLog();
      expect(log.length).toBe(1);
      expect(log[0].subject).toContain("Verify Your EthioFarm Account");
      expect(log[0].html).toContain("tok_verify_123");
      expect(log[0].html).toContain("EthioFarm Smart Farming & Advisory Platform");
      expect(log[0].html).toContain("Drought & Flood Forecasts");
      expect(log[0].html).toContain("Dual-AI Crop Diagnosis");
    });
  });

  describe("sendPasswordResetEmail", () => {
    it("generates professional HTML email with 6-digit OTP code and security notice", async () => {
      const res = await sendPasswordResetEmail("farmer@example.com", "849201");
      expect(res.success).toBe(true);

      const log = getSentEmailsLog();
      expect(log.length).toBe(1);
      expect(log[0].subject).toContain("Reset Your EthioFarm Account Password");
      expect(log[0].html).toContain("849201");
      expect(log[0].html).toContain("Valid for 5 minutes");
      expect(log[0].html).toContain("Security Notice");

    });
  });

  describe("sendEmergencyHazardAlertEmail", () => {
    it("generates professional HTML hazard alert email with severity branding and action steps", async () => {
      const res = await sendEmergencyHazardAlertEmail({
        email: "officer@example.com",
        woredaName: "Adama Zuria",
        hazardType: "FLOOD",
        severity: "CRITICAL",
        headline: "Awash River Level Surging Beyond 5-Year Threshold",
        message: "Heavy upstream rainfall in Kiremt season has caused river levels to rise rapidly.",
        actionSteps: ["Evacuate low-lying riverbed farms", "Deploy sandbag barriers"],
      });

      expect(res.success).toBe(true);
      const log = getSentEmailsLog();
      expect(log.length).toBe(1);
      expect(log[0].subject).toContain("[CRITICAL] FLOOD Early Warning Alert");
      expect(log[0].html).toContain("Adama Zuria");
      expect(log[0].html).toContain("Evacuate low-lying riverbed farms");
    });
  });

  describe("Safe Mock Fallback", () => {
    it("safely handles placeholder and test domains without throwing", async () => {
      const res = await sendEmail({
        to: "test_user_01@agrietech.et",
        subject: "Test Advisory",
        text: "Testing deliverability",
      });

      expect(res.success).toBe(true);
      expect(res.deliveredVia).toBe("SIMULATED");
    });
  });
});
