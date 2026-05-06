// Requirements: DB-001, DB-009, DB-010, DB-011, DB-012, DB-013, DB-014, DB-015, DB-016, ARC-003

export const tables = {
  electricityPrices: "electricity_prices",
  priceIntervals: "price_intervals",
  homePowerReadings: "home_power_readings",
  weatherForecasts: "weather_forecasts",
  solarPredictions: "solar_predictions",
  travelEvents: "travel_events",
  travelPredictions: "travel_predictions",
  chargingPlans: "charging_plans",
  decisionLogs: "decision_logs",
  decisionOutcomes: "decision_outcomes",
  userModes: "user_modes",
  userPreferences: "user_preferences",
} as const;
