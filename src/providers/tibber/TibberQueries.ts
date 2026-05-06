// Requirements: TIB-001, TIB-003, TEL-001, TEL-002

export const TIBBER_PRICE_QUERY = `
  query PriceInfo {
    viewer {
      homes {
        id
        currentSubscription {
          priceInfo {
            current {
              total
              energy
              tax
              startsAt
              currency
              level
            }
            today {
              total
              energy
              tax
              startsAt
              currency
              level
            }
            tomorrow {
              total
              energy
              tax
              startsAt
              currency
              level
            }
          }
        }
      }
    }
  }
`;

export const TIBBER_TELEMETRY_QUERY = `
  query HomeTelemetry {
    viewer {
      homes {
        id
        features {
          realTimeConsumptionEnabled
        }
        liveMeasurement {
          timestamp
          power
          powerProduction
        }
      }
    }
  }
`;
