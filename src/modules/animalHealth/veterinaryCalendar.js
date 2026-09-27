/**
 * @file veterinaryCalendar.js
 * @description Ethiopian Veterinary Calendar — Season-aware vaccination,
 * deworming, and health management schedules per livestock type.
 * Aligned with Ethiopian agricultural seasons (Kiremt, Belg, Bega/Dry).
 */

const VETERINARY_CALENDAR = {
  CATTLE: {
    vaccinations: [
      { vaccine: 'Anthrax (Sterne)', frequency: 'Annual', bestMonth: [9, 10], season: 'Post-Kiremt (Maskal)', priority: 'CRITICAL', notes: 'Before dry season grazing begins' },
      { vaccine: 'Blackleg (Clostridial)', frequency: 'Annual', bestMonth: [8, 9], season: 'Late Kiremt', priority: 'HIGH', notes: 'Young cattle 3-24 months' },
      { vaccine: 'FMD (Trivalent)', frequency: 'Every 6 months', bestMonth: [3, 9], season: 'Pre-Belg & Pre-Dry', priority: 'HIGH', notes: 'Cover all cattle >3 months' },
      { vaccine: 'LSD (Neethling)', frequency: 'Annual', bestMonth: [4, 5], season: 'Pre-Kiremt', priority: 'HIGH', notes: 'Before insect season peaks' },
      { vaccine: 'CBPP (T1/44)', frequency: 'Annual', bestMonth: [10, 11], season: 'Early Dry/Bega', priority: 'MODERATE', notes: 'Contagious Bovine Pleuropneumonia' },
      { vaccine: 'Pasteurella', frequency: 'Annual', bestMonth: [5, 6], season: 'Pre-Kiremt', priority: 'MODERATE', notes: 'Hemorrhagic Septicemia prevention' },
      { vaccine: 'Bovine TB (BCG)', frequency: 'Once', bestMonth: [1, 2], season: 'Dry/Bega', priority: 'LOW', notes: 'Limited availability in Ethiopia' },
    ],
    deworming: [
      { type: 'Internal Parasites (GI Nematodes)', frequency: 'Every 3-4 months', bestMonth: [3, 7, 11], drug: 'Albendazole 10 mg/kg or Ivermectin 0.2 mg/kg SC', notes: 'Critical post-Kiremt when parasite load peaks' },
      { type: 'Liver Fluke (Fasciola)', frequency: 'Every 6 months', bestMonth: [10, 4], drug: 'Triclabendazole 12 mg/kg or Nitroxynil 10 mg/kg SC', notes: 'Common in highland waterlogged areas' },
      { type: 'External Parasites (Ticks/Lice)', frequency: 'Weekly-Monthly', bestMonth: null, drug: 'Amitraz dip/spray, Deltamethrin pour-on', notes: 'Increase frequency during Kiremt (wet season)' },
    ],
    nutritionSupplements: [
      { supplement: 'Mineral Lick Block', frequency: 'Continuous', season: 'All year', notes: 'Contains salt, phosphorus, calcium, trace minerals' },
      { supplement: 'Urea-Molasses Block', frequency: 'Dry season', season: 'Bega (Oct-Feb)', notes: 'When natural forage quality drops' },
      { supplement: 'Vitamin A Injection', frequency: 'Once during dry season', season: 'Bega', notes: 'Prevents night blindness and reproductive failure' },
    ],
  },
  SHEEP_GOAT: {
    vaccinations: [
      { vaccine: 'PPR', frequency: 'Once (lifelong)', bestMonth: [9, 10], season: 'Post-Kiremt', priority: 'CRITICAL', notes: 'Single dose protects for life' },
      { vaccine: 'Anthrax (Sterne)', frequency: 'Annual', bestMonth: [9, 10], season: 'Post-Kiremt', priority: 'HIGH', notes: 'Especially in anthrax-endemic areas' },
      { vaccine: 'Sheep/Goat Pox', frequency: 'Annual', bestMonth: [3, 4], season: 'Pre-Belg', priority: 'MODERATE', notes: 'Before stress of rainy season' },
      { vaccine: 'Pasteurella', frequency: 'Annual', bestMonth: [5, 6], season: 'Pre-Kiremt', priority: 'MODERATE', notes: 'Prevents pneumonic pasteurellosis' },
    ],
    deworming: [
      { type: 'GI Parasites', frequency: 'Every 3 months', bestMonth: [3, 6, 9, 12], drug: 'Albendazole 7.5 mg/kg or Levamisole 7.5 mg/kg', notes: 'Critical for young lambs/kids' },
      { type: 'Lungworm', frequency: 'Every 6 months', bestMonth: [6, 12], drug: 'Ivermectin 0.2 mg/kg SC', notes: 'Common in highland areas' },
      { type: 'External (Mange/Lice)', frequency: 'As needed', bestMonth: null, drug: 'Ivermectin 0.2 mg/kg SC or Diazinon dip', notes: 'Sheep mange spreads rapidly in crowded pens' },
    ],
  },
  POULTRY: {
    vaccinations: [
      { vaccine: 'Newcastle Disease (HB1/LaSota)', frequency: 'Every 3-4 months', bestMonth: [1, 4, 7, 10], season: 'Quarterly', priority: 'CRITICAL', notes: 'Drinking water or eye-drop application' },
      { vaccine: 'NCD I-2 (Thermotolerant)', frequency: 'Every 3 months', bestMonth: [2, 5, 8, 11], season: 'Quarterly', priority: 'CRITICAL', notes: 'For village/backyard poultry — heat stable' },
      { vaccine: 'Infectious Bursal Disease (Gumboro)', frequency: 'Once at 14-21 days', bestMonth: null, season: 'Early life', priority: 'HIGH', notes: 'For commercial breeds' },
      { vaccine: 'Fowl Pox', frequency: 'Once at 6-8 weeks', bestMonth: null, season: 'Before dry season', priority: 'MODERATE', notes: 'Wing-web stab method' },
      { vaccine: 'Marek\'s Disease', frequency: 'Day-old chick', bestMonth: null, season: 'Hatchery', priority: 'HIGH', notes: 'For commercial hatcheries only' },
    ],
    deworming: [
      { type: 'Internal Parasites (Roundworm)', frequency: 'Every 3 months', bestMonth: [3, 6, 9, 12], drug: 'Piperazine in drinking water', notes: 'Treat the entire flock simultaneously' },
      { type: 'External (Lice/Mites)', frequency: 'As needed', bestMonth: null, drug: 'Permethrin dust or Ivermectin', notes: 'Clean and disinfect poultry house' },
    ],
  },
  CAMEL: {
    vaccinations: [
      { vaccine: 'Anthrax', frequency: 'Annual', bestMonth: [9, 10], season: 'Post-rains', priority: 'HIGH', notes: 'Essential for pastoral herds' },
      { vaccine: 'Camelpox', frequency: 'Annual', bestMonth: [1, 2], season: 'Dry season', priority: 'MODERATE', notes: 'Live attenuated vaccine' },
      { vaccine: 'Hemorrhagic Septicemia', frequency: 'Annual', bestMonth: [5, 6], season: 'Pre-rains', priority: 'MODERATE', notes: 'Before wet season stress' },
    ],
    deworming: [
      { type: 'GI Parasites', frequency: 'Every 4-6 months', bestMonth: [4, 10], drug: 'Ivermectin 0.2 mg/kg SC', notes: 'Critical for young camels' },
      { type: 'Trypanosomiasis (Surra)', frequency: 'As needed', bestMonth: null, drug: 'Suramin or Melarsomine', notes: 'In tsetse/tabanid-infested areas' },
    ],
  },
  EQUINE: {
    vaccinations: [
      { vaccine: 'African Horse Sickness', frequency: 'Annual', bestMonth: [4, 5], season: 'Pre-Kiremt', priority: 'CRITICAL', notes: 'Before midge season (Culicoides vectors)' },
      { vaccine: 'Anthrax', frequency: 'Annual', bestMonth: [9, 10], season: 'Post-Kiremt', priority: 'HIGH', notes: 'In anthrax-endemic areas' },
      { vaccine: 'Tetanus', frequency: 'Annual', bestMonth: [1, 2], season: 'Dry season', priority: 'MODERATE', notes: 'Especially for working donkeys/horses' },
    ],
    deworming: [
      { type: 'GI Parasites', frequency: 'Every 2-3 months', bestMonth: [2, 5, 8, 11], drug: 'Ivermectin paste 0.2 mg/kg PO or Fenbendazole 7.5 mg/kg', notes: 'Rotate anthelmintic classes to prevent resistance' },
    ],
  },
};

/**
 * Get the current Ethiopian season and upcoming veterinary tasks
 * @param {number} [month] — 1-indexed month (defaults to current)
 */
function getUpcomingVetTasks(month = new Date().getMonth() + 1) {
  const currentSeason = month >= 6 && month <= 9 ? 'KIREMT' : (month >= 3 && month <= 5 ? 'BELG' : 'DRY');
  const upcomingMonths = [month, ((month % 12) + 1), (((month + 1) % 12) + 1)]; // Current + next 2 months

  const tasks = [];

  for (const [animalType, schedule] of Object.entries(VETERINARY_CALENDAR)) {
    for (const vax of schedule.vaccinations || []) {
      if (vax.bestMonth && vax.bestMonth.some((m) => upcomingMonths.includes(m))) {
        tasks.push({
          animalType,
          taskType: 'VACCINATION',
          name: vax.vaccine,
          priority: vax.priority,
          season: vax.season,
          dueMonths: vax.bestMonth,
          notes: vax.notes,
        });
      }
    }
    for (const dw of schedule.deworming || []) {
      if (dw.bestMonth && dw.bestMonth.some((m) => upcomingMonths.includes(m))) {
        tasks.push({
          animalType,
          taskType: 'DEWORMING',
          name: dw.type,
          drug: dw.drug,
          dueMonths: dw.bestMonth,
          notes: dw.notes,
        });
      }
    }
  }

  return {
    currentMonth: month,
    currentSeason,
    upcomingTaskCount: tasks.length,
    tasks: tasks.sort((a, b) => {
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
      return (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
    }),
  };
}

module.exports = {
  VETERINARY_CALENDAR,
  getUpcomingVetTasks,
};
