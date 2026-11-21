import styles from "./WritingSettings.module.css";

export default function SettingsSwitch({ label, detail, checked, onChange }: {
  label: string; detail?: string; checked: boolean; onChange: (value: boolean) => void;
}) {
  return <label className={styles.switchRow}>
    <span><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
    <input type="checkbox" role="switch" checked={checked} onChange={event => onChange(event.target.checked)} aria-label={label}/>
  </label>;
}
