/**
 * Agricultural Chemical Tank-Mix & Physical Compatibility Validator
 * Implements the International W-A-L-E-S Tank-Mixing Standard & EIAR Safety Protocols.
 */

const FORMULATION_TYPES = {
  WP: { code: 'WP', name: 'Wettable Powder', walesOrder: 1, step: 'W - Wettable Powders & Granules' },
  WDG: { code: 'WDG', name: 'Water Dispersible Granules', walesOrder: 1, step: 'W - Wettable Powders & Granules' },
  WG: { code: 'WG', name: 'Water Dispersible Granules', walesOrder: 1, step: 'W - Wettable Powders & Granules' },
  SC: { code: 'SC', name: 'Suspension Concentrate / Flowable', walesOrder: 3, step: 'L - Liquid Flowables & Suspensions' },
  OD: { code: 'OD', name: 'Oil Dispersion', walesOrder: 3, step: 'L - Liquid Flowables & Suspensions' },
  EC: { code: 'EC', name: 'Emulsifiable Concentrate', walesOrder: 4, step: 'E - Emulsifiable Concentrates' },
  SL: { code: 'SL', name: 'Soluble Liquid Concentrate', walesOrder: 5, step: 'S - Soluble Liquids & Surfactants' },
  FOLIAR: { code: 'FOLIAR', name: 'Foliar Nutrient / Fertilizer', walesOrder: 5, step: 'S - Soluble Liquids & Surfactants' }
};

const COMMON_AGROCHEMICALS = [
  { id: '2_4_d_amine', name: '2,4-D Amine 720 SL', type: 'HERBICIDE', formulation: 'SL', family: 'Synthetic Auxin', phRange: 'Slightly Alkaline (7.5-8.5)' },
  { id: 'palace_75_wg', name: 'Palace 75 WG (Pyroxsulam)', type: 'HERBICIDE', formulation: 'WG', family: 'ALS Inhibitor', phRange: 'Neutral' },
  { id: 'pallas_45_od', name: 'Pallas 45 OD (Pyroxsulam)', type: 'HERBICIDE', formulation: 'OD', family: 'ALS Inhibitor', phRange: 'Neutral' },
  { id: 'topic_080_ec', name: 'Topic 080 EC (Clodinafop)', type: 'HERBICIDE', formulation: 'EC', family: 'ACCase Inhibitor', phRange: 'Acidic to Neutral' },
  { id: 'roundup_480_sl', name: 'Roundup 480 SL (Glyphosate)', type: 'HERBICIDE', formulation: 'SL', family: 'Phosphonoglycine', phRange: 'Acidic (4.5-5.5)' },
  { id: 'tilt_250_ec', name: 'Tilt 250 EC (Propiconazole)', type: 'FUNGICIDE', formulation: 'EC', family: 'Triazole', phRange: 'Neutral' },
  { id: 'rex_duo', name: 'Rex Duo (Epoxiconazole + Thiophenate)', type: 'FUNGICIDE', formulation: 'SC', family: 'Triazole + Benzimidazole', phRange: 'Neutral' },
  { id: 'copper_hydroxide_wp', name: 'Kocide 2000 / Copper Hydroxide WP', type: 'FUNGICIDE', formulation: 'WP', family: 'Inorganic Copper', phRange: 'Alkaline' },
  { id: 'mancozeb_80_wp', name: 'Mancozeb 80% WP (Dithane M-45)', type: 'FUNGICIDE', formulation: 'WP', family: 'Dithiocarbamate', phRange: 'Neutral' },
  { id: 'ampligo_150_zc', name: 'Ampligo 150 ZC', type: 'INSECTICIDE', formulation: 'SC', family: 'Diamide + Pyrethroid', phRange: 'Neutral' },
  { id: 'karate_5_ec', name: 'Karate 5 EC (Lambda-cyhalothrin)', type: 'INSECTICIDE', formulation: 'EC', family: 'Pyrethroid', phRange: 'Neutral' },
  { id: 'dimethoate_40_ec', name: 'Dimethoate 40% EC', type: 'INSECTICIDE', formulation: 'EC', family: 'Organophosphate', phRange: 'Acidic' },
  { id: 'urea_foliar', name: 'Foliar Urea Solution (2% N)', type: 'NUTRIENT', formulation: 'FOLIAR', family: 'Nitrogen Salt', phRange: 'Neutral' },
  { id: 'zinc_sulfate', name: 'Zinc Sulfate (ZnSO4 21%)', type: 'NUTRIENT', formulation: 'FOLIAR', family: 'Micronutrient Salt', phRange: 'Acidic' },
  { id: 'calcium_nitrate', name: 'Calcium Nitrate Foliar', type: 'NUTRIENT', formulation: 'FOLIAR', family: 'Calcium Salt', phRange: 'Neutral' },
  { id: 'monoammonium_phosphate', name: 'Monoammonium Phosphate (MAP 12-61-0)', type: 'NUTRIENT', formulation: 'FOLIAR', family: 'Phosphate Salt', phRange: 'Acidic' }
];

// Incompatibility rules between chemicals
const INCOMPATIBILITY_RULES = [
  {
    pair: ['2_4_d_amine', 'copper_hydroxide_wp'],
    riskLevel: 'INCOMPATIBLE',
    issueEn: 'Severe chemical reaction: Copper reacts with amine salts forming an insoluble curdled gelatinous precipitate that permanently blocks spray nozzles and reduces herbicide efficacy by >70%.',
    issueAm: 'ከፍተኛ አደጋ፡ መዳብ (ኮፐር) ከ2,4-ዲ አሚን ጋር ሲደባለቅ የሚረጭበትን ቱቦና ኖዝል የሚያዘጋ የረጋ ፈሳሽ (curd) ይፈጥራል፤ አረም የማጥፋት ኃይሉንም ያሳጣል።',
    actionEn: 'Do NOT mix in the same tank. Apply at least 5 days apart.',
    actionAm: 'በአንድ ላይ በፍጹም አይቀላቅሏቸው። ቢያንስ የ5 ቀናት ልዩነት ሰጥተው ለየብቻ ይርጩ።'
  },
  {
    pair: ['dimethoate_40_ec', 'copper_hydroxide_wp'],
    riskLevel: 'INCOMPATIBLE',
    issueEn: 'Alkaline hydrolysis: The high alkaline pH of copper solutions rapidly hydrolyzes and breaks down Dimethoate within minutes, neutralizing insecticide potency.',
    issueAm: 'የኬሚካል መፈራረስ፡ የኮፐር አልካላይን ባህሪ ዲሜቶኤት የተባለውን ፀረ-ተባይ በደቂቃዎች ውስጥ አፈራርሶ ከንቱ ያደርገዋል።',
    actionEn: 'Do NOT tank-mix. Spray separately.',
    actionAm: 'አይቀላቅሉ። ለየብቻ ይርጩ።'
  },
  {
    pair: ['calcium_nitrate', 'monoammonium_phosphate'],
    riskLevel: 'INCOMPATIBLE',
    issueEn: 'Insoluble Salt Precipitation: Calcium ions bind instantly with phosphate ions creating insoluble calcium phosphate (gypsum-like chalky crystals), clogging all sprayer filters.',
    issueAm: 'የኖራ ድንጋይ ክሪስታል መፈጠር፡ ካልሲየም እና ፎስፌት ሲገናኙ የማይቀልጥ ነጭ ኖራ ፈጥረው የመርጫውን ማጣሪያ ያበላሻሉ።',
    actionEn: 'Never mix Calcium and Phosphate in the same tank. Apply separately in alternate spray passes.',
    actionAm: 'ካልሲየም እና ፎስፌትን በአንድ ታንክ በፍጹም አያቀላቅሉ።'
  },
  {
    pair: ['urea_foliar', 'copper_hydroxide_wp'],
    riskLevel: 'CAUTION',
    issueEn: 'High Phytotoxicity Risk: Urea increases cuticular permeability, which causes rapid hyper-absorption of copper ions leading to severe foliar leaf scorch and necrotic burning.',
    issueAm: 'የቅጠል ማቃጠል አደጋ፡ ዩሪያ የቅጠሉን ቀዳዳ ስለሚከፍት መዳብ በከፍተኛ መጠን ተውጦ ቅጠሎችን በከፍተኛ ሁኔታ ሊያቃጥል ይችላል።',
    actionEn: 'Caution: Keep Urea concentration strictly below 1% if mixing, or apply separately.',
    actionAm: 'ጥንቃቄ፡ ከተቀላቀለ የዩሪያው መጠን ከ1% እንዳይበልጥ ያድርጉ ወይም ለየብቻ ይርጩ።'
  },
  {
    pair: ['roundup_480_sl', '2_4_d_amine'],
    riskLevel: 'ACCEPTABLE_WITH_WATER_CONDITIONER',
    issueEn: 'Hard water antagonism: Amine salts and calcium/magnesium ions in hard water reduce glyphosate efficacy. Add ammonium sulfate (AMS) conditioner first.',
    issueAm: 'ከባድ ውሃ ከሆነ የglyphosate ብቃት ሊቀንስ ይችላል፤ በመጀመሪያ አሞኒየም ሰልፌት መጨመር ይመረጣል።',
    actionEn: 'Add Ammonium Sulfate (AMS) conditioner to water first, agitate, then add 2,4-D Amine, and lastly Roundup.',
    actionAm: 'በመጀመሪያ ውሃውን በአሞኒየም ሰልፌት ያዘጋጁ፣ በመቀጠል 2,4-ዲ፣ በመጨረሻም ራውንድ አፕ ይጨምሩ።'
  },
  {
    pair: ['palace_75_wg', 'tilt_250_ec'],
    riskLevel: 'COMPATIBLE_WITH_W_A_L_E_S',
    issueEn: 'Compatible if mixed strictly following W-A-L-E-S order: Dissolve Palace WG granules first completely with agitation, then add Tilt EC.',
    issueAm: 'ተስማሚ ናቸው፤ ነገር ግን በመጀመሪያ የፓላስ (Palace WG) ዱቄቱን በደንብ በውሃ አሟምተው ካዋሀዱ በኋላ የቲልት (Tilt EC) ፈሳሹን ይጨምሩ።',
    actionEn: 'Follow W-A-L-E-S: Granules (W) first, then Emulsifiable Concentrate (E).',
    actionAm: 'ቅደም ተከተል፡ ዱቄቱን አስቀድመው ያሟሙ፣ በመቀጠል ዘይት መሳይ ፈሳሹን ያክሉ።'
  }
];

/**
 * Validate Tank Mix Compatibility for given product IDs or names
 */
function validateTankMixCompatibility({ productIds = [], waterVolumeLiters = 16 }) {
  if (!Array.isArray(productIds) || productIds.length < 2) {
    return {
      isValid: true,
      riskLevel: 'SAFE_SINGLE_PRODUCT',
      messageEn: 'Single product selected. No tank-mix incompatibility risk.',
      messageAm: 'አንድ ኬሚካል ብቻ ስለተመረጠ የመደባለቅ አደጋ የለም።',
      products: productIds,
      walesOrder: [],
      jarTestNeeded: false
    };
  }

  // Map input names or IDs to known registry
  const matchedProducts = productIds.map(id => {
    const cleanId = String(id).toLowerCase().trim();
    const found = COMMON_AGROCHEMICALS.find(p => p.id === cleanId || p.name.toLowerCase().includes(cleanId));
    if (found) return found;
    // Default fallback
    return {
      id: cleanId.replace(/[^a-z0-9]/g, '_'),
      name: id,
      type: 'AGROCHEMICAL',
      formulation: 'EC',
      family: 'Unknown',
      phRange: 'Neutral'
    };
  });

  const conflicts = [];
  let highestRisk = 'SAFE';

  for (let i = 0; i < matchedProducts.length; i++) {
    for (let j = i + 1; j < matchedProducts.length; j++) {
      const p1 = matchedProducts[i];
      const p2 = matchedProducts[j];

      const rule = INCOMPATIBILITY_RULES.find(r => 
        (r.pair[0] === p1.id && r.pair[1] === p2.id) ||
        (r.pair[1] === p1.id && r.pair[0] === p2.id)
      );

      if (rule) {
        conflicts.push({
          productA: p1.name,
          productB: p2.name,
          riskLevel: rule.riskLevel,
          issueEn: rule.issueEn,
          issueAm: rule.issueAm,
          actionEn: rule.actionEn,
          actionAm: rule.actionAm
        });

        if (rule.riskLevel === 'INCOMPATIBLE') highestRisk = 'INCOMPATIBLE';
        else if (rule.riskLevel === 'CAUTION' && highestRisk !== 'INCOMPATIBLE') highestRisk = 'CAUTION';
      }
    }
  }

  // Calculate W-A-L-E-S Mixing Order
  // Sort products based on W-A-L-E-S sequence
  const sortedByWales = [...matchedProducts].sort((a, b) => {
    const orderA = FORMULATION_TYPES[a.formulation]?.walesOrder || 4;
    const orderB = FORMULATION_TYPES[b.formulation]?.walesOrder || 4;
    return orderA - orderB;
  });

  const mixingSequence = [
    {
      stepNumber: 1,
      code: 'START',
      titleEn: 'Fill Sprayer Tank Half Full with Clean Water',
      titleAm: 'የመርጫውን ታንክ በንጹህ ውሃ ግማሽ ያህል ይሙሉ',
      detailEn: `Add ${Math.round(waterVolumeLiters * 0.5)} Liters of clean, debris-free water into the ${waterVolumeLiters}L tank and start constant agitation.`,
      detailAm: `በ${waterVolumeLiters} ሊትር ታንክ ውስጥ ግማሽ ንጹህ ውሃ ጨምረው ማማሰል ይጀምሩ።`
    }
  ];

  sortedByWales.forEach((prod, index) => {
    const formInfo = FORMULATION_TYPES[prod.formulation] || FORMULATION_TYPES.EC;
    mixingSequence.push({
      stepNumber: index + 2,
      code: prod.formulation,
      titleEn: `Step ${index + 2}: Add ${prod.name} (${formInfo.step})`,
      titleAm: `ደረጃ ${index + 2}፡ ${prod.name} ይጨምሩ (${formInfo.name})`,
      detailEn: `Slowly pour ${prod.name} into the water while continuously stirring. Ensure complete suspension before introducing the next compound.`,
      detailAm: `${prod.name}ን እየተንሰከሰከ እንዳይረጋ በደንብ እያማሰሉ ይጨምሩ። ሙሉ በሙሉ መዋሃዱን ያረጋግጡ።`
    });
  });

  mixingSequence.push({
    stepNumber: sortedByWales.length + 2,
    code: 'TOP_OFF',
    titleEn: `Top off with remaining ${Math.round(waterVolumeLiters * 0.5)}L water and agitate`,
    titleAm: `ቀሪውን ውሃ ሞልተው በደንብ ያማስሉ`,
    detailEn: `Bring final water volume to exactly ${waterVolumeLiters} Liters. Agitate for 2 full minutes before spraying.`,
    detailAm: `ውሃውን እስከ ${waterVolumeLiters} ሊትር ድረስ ሞልተው ለ2 ደቂቃ በደንብ ያማስሉ።`
  });

  const jarTestProcedure = {
    titleEn: 'Standard 500 mL Jar Test Protocol (Pre-Mix Validation)',
    titleAm: 'የመስታወት ጠርሙስ ቅድመ-ሙከራ (Jar Test)',
    instructionsEn: [
      'Take a clean 500 mL clear glass jar or plastic bottle.',
      'Fill with 250 mL of the exact well/stream water you plan to use for spraying.',
      'Add proportional amounts of each chemical in the exact W-A-L-E-S order (approx. 1/40th of a knapsack dose per product).',
      'Close jar and shake gently for 15 seconds. Let stand for 15-30 minutes.',
      'Check for incompatibilities: If you see curdling, sludge, layering, flakes, heavy sedimentation, or extreme heat release, DO NOT SPRAY in your tank!'
    ],
    instructionsAm: [
      'ንጹህ ባለ 500 ሚሊ ሊትር ግልጽ የመስታወት ወይም የፕላስቲክ ጠርሙስ ይውሰዱ።',
      'ግማሽ (250 ሚ.ሊ) ለርጭት የሚጠቀሙበትን ንጹህ ውሃ ይጨምሩ።',
      'በW-A-L-E-S ቅደም ተከተል መሰረት መጠኑን አሳንሰው እያንዳንዱን ኬሚካል ይጨምሩ።',
      'ጠርሙሱን ከድነው ለ15 ሰከንድ ያናውጡ፤ ከዚያም ለ15-30 ደቂቃ ያቆዩት።',
      'የመርጋት፣ የመጓጎል፣ የመለያየት ወይም ነጭ አረፋ የመስራት ምልክት ካሳየ በታንክ ውስጥ በፍጹም አይቀላቅሉ!'
    ]
  };

  return {
    isValid: highestRisk !== 'INCOMPATIBLE',
    riskLevel: highestRisk,
    compatibilityStatus: highestRisk,
    matchedProducts,
    hasConflicts: conflicts.length > 0,
    conflicts,
    mixingSequence,
    jarTestProcedure
  };
}

module.exports = {
  COMMON_AGROCHEMICALS,
  FORMULATION_TYPES,
  validateTankMixCompatibility
};
