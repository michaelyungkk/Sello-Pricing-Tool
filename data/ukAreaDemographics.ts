export type IncomeBand =
  | 'Low'
  | 'Lower-Mid'
  | 'Mid'
  | 'Upper-Mid'
  | 'High'
  | 'Unknown';

export type HouseholdProfile =
  | 'Family-Heavy'
  | 'Single-Heavy'
  | 'Mixed'
  | 'Unknown';

export type RuralUrbanFlag =
  | 'Urban'
  | 'Rural'
  | 'Mixed'
  | 'Unknown';

export interface AreaDemographics {
  areaCode: string;
  incomeBand: IncomeBand;
  householdProfile: HouseholdProfile;
  deprivationDecile: number | null;
  ruralUrbanFlag: RuralUrbanFlag;
}

// Compact, area-level enrichment keyed by postcode area prefix (e.g. "SW", "B", "M").
// Auto-generated from external ONS/NSPL/IMD ETL output.
export const UK_AREA_DEMOGRAPHICS: Record<string, AreaDemographics> = {
  "AB": {
    "areaCode": "AB",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Mixed"
  },
  "AL": {
    "areaCode": "AL",
    "incomeBand": "High",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 8,
    "ruralUrbanFlag": "Urban"
  },
  "B": {
    "areaCode": "B",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "BA": {
    "areaCode": "BA",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "BB": {
    "areaCode": "BB",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "BD": {
    "areaCode": "BD",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "BH": {
    "areaCode": "BH",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "BL": {
    "areaCode": "BL",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "BN": {
    "areaCode": "BN",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "BR": {
    "areaCode": "BR",
    "incomeBand": "High",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "BS": {
    "areaCode": "BS",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "BT": {
    "areaCode": "BT",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Unknown"
  },
  "CA": {
    "areaCode": "CA",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Mixed"
  },
  "CB": {
    "areaCode": "CB",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "CF": {
    "areaCode": "CF",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Urban"
  },
  "CH": {
    "areaCode": "CH",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "CM": {
    "areaCode": "CM",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "CO": {
    "areaCode": "CO",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "CR": {
    "areaCode": "CR",
    "incomeBand": "High",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "CT": {
    "areaCode": "CT",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "CV": {
    "areaCode": "CV",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "CW": {
    "areaCode": "CW",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "DA": {
    "areaCode": "DA",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "DD": {
    "areaCode": "DD",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Urban"
  },
  "DE": {
    "areaCode": "DE",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "DG": {
    "areaCode": "DG",
    "incomeBand": "Lower-Mid",
    "householdProfile": "Unknown",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Mixed"
  },
  "DH": {
    "areaCode": "DH",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "DL": {
    "areaCode": "DL",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Mixed"
  },
  "DN": {
    "areaCode": "DN",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "DT": {
    "areaCode": "DT",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Mixed"
  },
  "DY": {
    "areaCode": "DY",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "E": {
    "areaCode": "E",
    "incomeBand": "High",
    "householdProfile": "Mixed",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "EC": {
    "areaCode": "EC",
    "incomeBand": "High",
    "householdProfile": "Single-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "EH": {
    "areaCode": "EH",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Urban"
  },
  "EN": {
    "areaCode": "EN",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "EX": {
    "areaCode": "EX",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Mixed"
  },
  "FK": {
    "areaCode": "FK",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Urban"
  },
  "FY": {
    "areaCode": "FY",
    "incomeBand": "Lower-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "G": {
    "areaCode": "G",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Urban"
  },
  "GI": {
    "areaCode": "GI",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Unknown"
  },
  "GL": {
    "areaCode": "GL",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "GU": {
    "areaCode": "GU",
    "incomeBand": "High",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 8,
    "ruralUrbanFlag": "Urban"
  },
  "GY": {
    "areaCode": "GY",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Unknown"
  },
  "HA": {
    "areaCode": "HA",
    "incomeBand": "High",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "HD": {
    "areaCode": "HD",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "HG": {
    "areaCode": "HG",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Unknown",
    "deprivationDecile": 8,
    "ruralUrbanFlag": "Urban"
  },
  "HP": {
    "areaCode": "HP",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 8,
    "ruralUrbanFlag": "Urban"
  },
  "HR": {
    "areaCode": "HR",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Mixed"
  },
  "HS": {
    "areaCode": "HS",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Rural"
  },
  "HU": {
    "areaCode": "HU",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "HX": {
    "areaCode": "HX",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "IG": {
    "areaCode": "IG",
    "incomeBand": "High",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "IM": {
    "areaCode": "IM",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Unknown"
  },
  "IP": {
    "areaCode": "IP",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Mixed"
  },
  "IV": {
    "areaCode": "IV",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Mixed"
  },
  "JE": {
    "areaCode": "JE",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Unknown"
  },
  "KA": {
    "areaCode": "KA",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Urban"
  },
  "KT": {
    "areaCode": "KT",
    "incomeBand": "High",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 8,
    "ruralUrbanFlag": "Urban"
  },
  "KW": {
    "areaCode": "KW",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Rural"
  },
  "KY": {
    "areaCode": "KY",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Urban"
  },
  "L": {
    "areaCode": "L",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "LA": {
    "areaCode": "LA",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "LD": {
    "areaCode": "LD",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Mixed"
  },
  "LE": {
    "areaCode": "LE",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "LL": {
    "areaCode": "LL",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Mixed"
  },
  "LN": {
    "areaCode": "LN",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "LS": {
    "areaCode": "LS",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "LU": {
    "areaCode": "LU",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "M": {
    "areaCode": "M",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "ME": {
    "areaCode": "ME",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "MK": {
    "areaCode": "MK",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "ML": {
    "areaCode": "ML",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Urban"
  },
  "N": {
    "areaCode": "N",
    "incomeBand": "High",
    "householdProfile": "Mixed",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "NE": {
    "areaCode": "NE",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "NG": {
    "areaCode": "NG",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "NN": {
    "areaCode": "NN",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "NP": {
    "areaCode": "NP",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "NR": {
    "areaCode": "NR",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "NW": {
    "areaCode": "NW",
    "incomeBand": "High",
    "householdProfile": "Mixed",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "OL": {
    "areaCode": "OL",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "OX": {
    "areaCode": "OX",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 8,
    "ruralUrbanFlag": "Urban"
  },
  "PA": {
    "areaCode": "PA",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Urban"
  },
  "PE": {
    "areaCode": "PE",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "PH": {
    "areaCode": "PH",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Rural"
  },
  "PL": {
    "areaCode": "PL",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "PO": {
    "areaCode": "PO",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "PR": {
    "areaCode": "PR",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "RG": {
    "areaCode": "RG",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 8,
    "ruralUrbanFlag": "Urban"
  },
  "RH": {
    "areaCode": "RH",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 8,
    "ruralUrbanFlag": "Urban"
  },
  "RM": {
    "areaCode": "RM",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "S": {
    "areaCode": "S",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "SA": {
    "areaCode": "SA",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Mixed"
  },
  "SE": {
    "areaCode": "SE",
    "incomeBand": "High",
    "householdProfile": "Mixed",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "SG": {
    "areaCode": "SG",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "SK": {
    "areaCode": "SK",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "SL": {
    "areaCode": "SL",
    "incomeBand": "High",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 8,
    "ruralUrbanFlag": "Urban"
  },
  "SM": {
    "areaCode": "SM",
    "incomeBand": "High",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "SN": {
    "areaCode": "SN",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "SO": {
    "areaCode": "SO",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "SP": {
    "areaCode": "SP",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Mixed"
  },
  "SR": {
    "areaCode": "SR",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "SS": {
    "areaCode": "SS",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "ST": {
    "areaCode": "ST",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "SW": {
    "areaCode": "SW",
    "incomeBand": "High",
    "householdProfile": "Mixed",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "SY": {
    "areaCode": "SY",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Mixed"
  },
  "TA": {
    "areaCode": "TA",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Mixed"
  },
  "TD": {
    "areaCode": "TD",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Mixed"
  },
  "TF": {
    "areaCode": "TF",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "TN": {
    "areaCode": "TN",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "TQ": {
    "areaCode": "TQ",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "TR": {
    "areaCode": "TR",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Mixed"
  },
  "TS": {
    "areaCode": "TS",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "TW": {
    "areaCode": "TW",
    "incomeBand": "High",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "UB": {
    "areaCode": "UB",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "W": {
    "areaCode": "W",
    "incomeBand": "High",
    "householdProfile": "Mixed",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "WA": {
    "areaCode": "WA",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "WC": {
    "areaCode": "WC",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Mixed",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "WD": {
    "areaCode": "WD",
    "incomeBand": "Upper-Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "WF": {
    "areaCode": "WF",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 4,
    "ruralUrbanFlag": "Urban"
  },
  "WN": {
    "areaCode": "WN",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "WR": {
    "areaCode": "WR",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 6,
    "ruralUrbanFlag": "Urban"
  },
  "WS": {
    "areaCode": "WS",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "WV": {
    "areaCode": "WV",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 5,
    "ruralUrbanFlag": "Urban"
  },
  "YO": {
    "areaCode": "YO",
    "incomeBand": "Mid",
    "householdProfile": "Family-Heavy",
    "deprivationDecile": 7,
    "ruralUrbanFlag": "Urban"
  },
  "ZE": {
    "areaCode": "ZE",
    "incomeBand": "Unknown",
    "householdProfile": "Unknown",
    "deprivationDecile": null,
    "ruralUrbanFlag": "Rural"
  }
};

export const getAreaDemographics = (areaCode: string): AreaDemographics => {
  const key = String(areaCode || '').trim().toUpperCase();
  return (
    UK_AREA_DEMOGRAPHICS[key] || {
      areaCode: key,
      incomeBand: 'Unknown',
      householdProfile: 'Unknown',
      deprivationDecile: null,
      ruralUrbanFlag: 'Unknown'
    }
  );
};
