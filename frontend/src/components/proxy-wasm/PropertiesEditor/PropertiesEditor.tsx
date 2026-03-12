import { useState } from "react";
import { DictionaryInput } from "../../common/DictionaryInput";
import styles from "./PropertiesEditor.module.css";

interface PropertiesEditorProps {
  value: Record<string, string>;
  onChange: (properties: Record<string, string>) => void;
}

type CountryPreset = {
  code: string;
  name: string;
  city: string;
  geoLat: string;
  geoLong: string;
  region: string;
  continent: string;
  flag: string;
};

const countryPresets: Record<string, CountryPreset> = {
  luxembourg: {
    code: "LU",
    name: "Luxembourg",
    city: "Luxembourg",
    geoLat: "49.6116",
    geoLong: "6.1319",
    region: "Luxembourg",
    continent: "Europe",
    flag: "🇱🇺",
  },
  germany: {
    code: "DE",
    name: "Germany",
    city: "Frankfurt",
    geoLat: "50.1109",
    geoLong: "8.6821",
    region: "Hesse",
    continent: "Europe",
    flag: "🇩🇪",
  },
};

const getPropertiesForCountry = (countryKey: string) => {
  const country = countryPresets[countryKey];
  return {
    // Enabled properties first (those with values)
    "request.country": { value: country.code, placeholder: country.code },
    "request.city": { value: country.city, placeholder: country.city },
    "request.geo.lat": { value: country.geoLat, placeholder: country.geoLat },
    "request.geo.long": {
      value: country.geoLong,
      placeholder: country.geoLong,
    },
    "request.region": { value: country.region, placeholder: country.region },
    "request.continent": {
      value: country.continent,
      placeholder: country.continent,
    },
    "request.country.name": { value: country.name, placeholder: country.name },
    // Calculated properties - read-only and enabled
    "request.url": {
      value: "",
      placeholder: "<Calculated>",
      enabled: true,
      readOnly: true,
    },
    "request.host": {
      value: "",
      placeholder: "<Calculated>",
      enabled: true,
      readOnly: true,
    },
    "request.path": {
      value: "",
      placeholder: "<Calculated>",
      enabled: true,
      readOnly: true,
    },
    "request.scheme": {
      value: "",
      placeholder: "<Calculated>",
      enabled: true,
      readOnly: true,
    },
    "request.extension": {
      value: "",
      placeholder: "<Calculated>",
      enabled: true,
      readOnly: true,
    },
    "request.query": {
      value: "",
      placeholder: "<Calculated>",
      enabled: true,
      readOnly: true,
    },
    "request.x_real_ip": {
      value: "203.0.113.42",
      placeholder: "Client IP address",
      enabled: false,
    },
    "request.asn": {
      value: "",
      placeholder: "<Calculated>",
      enabled: true,
      readOnly: true,
    },
    "request.var": {
      value: "",
      placeholder: "<Calculated>",
      enabled: true,
      readOnly: true,
    },
  };
};

export function PropertiesEditor({ value, onChange }: PropertiesEditorProps) {
  const [selectedCountry, setSelectedCountry] = useState<string>("luxembourg");

  const handleCountryChange = (countryKey: string) => {
    setSelectedCountry(countryKey);
  };

  return (
    <div>
      <div className={styles.countryPresets}>
        {Object.entries(countryPresets).map(([key, preset]) => (
          <label key={key} className={styles.countryLabel}>
            <input
              type="radio"
              name="country"
              value={key}
              checked={selectedCountry === key}
              onChange={() => handleCountryChange(key)}
            />
            <span className={styles.flag}>{preset.flag}</span>
            <span>{preset.name}</span>
          </label>
        ))}
      </div>
      <DictionaryInput
        value={value}
        onChange={onChange}
        keyPlaceholder="Property path"
        valuePlaceholder="Property value"
        disableDelete={true}
        defaultValues={getPropertiesForCountry(selectedCountry)}
      />
    </div>
  );
}
