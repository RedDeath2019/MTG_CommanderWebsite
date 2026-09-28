import { useRef, useState } from 'react'
import { collectionFromMoxfieldRows, looksLikeMoxfieldCsv, lookupMoxfieldPrintings, parseMoxfieldCsv, resolveMoxfieldRows, type ResolvedMoxfieldRow } from './domain/moxfield'
import './moxfield.css'

interface Props {
  onClose: () => void
  onImport: (rows: ResolvedMoxfieldRow[], mode: 'replace' | 'add') => void
  onLegacyImport?: (file: File) => void
}

function formatLookupProgress(current: number, total: number): string {
  return `Resolved ${current.toLocaleString()} of ${total.toLocaleString()} unique printings…`
}

export default function MoxfieldImportDialog({ onClose, onImport, onLegacyImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ResolvedMoxfieldRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'replace' | 'add'>('replace')
  const [progress, setProgress] = useState('')

  async function chooseFile(file?: File) {
    if (!file) return
    setErrors([])
    setRows([])
    setProgress('')
    const text = await file.text()
    const parsed = parseMoxfieldCsv(text)
    if (parsed.errors.length && !parsed.rows.length) {
      setErrors(parsed.errors)
      return
    }
    if (!looksLikeMoxfieldCsv(text)) {
      if (onLegacyImport) onLegacyImport(file)
      else setErrors(['This is not a Moxfield export. Expected Moxfield inventory columns.'])
      return
    }
    setErrors(parsed.errors)
    setRows([])
    setMode('replace')
    setLoading(true)
    try {
      const lookup = await lookupMoxfieldPrintings(parsed.rows, undefined, (current, total) => setProgress(formatLookupProgress(current, total)), 500)
      const resolved = resolveMoxfieldRows(parsed.rows, lookup.cards)
      setRows(resolved.rows)
      setErrors([...parsed.errors, ...lookup.errors, ...resolved.errors])
    } catch (error) {
      setErrors([...parsed.errors, error instanceof Error ? error.message : 'Could not resolve card printings.'])
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const total = Object.values(collectionFromMoxfieldRows(rows)).reduce((sum, quantity) => sum + quantity, 0)
  return <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
      <div className="eyebrow"><span>COLLECTION SETUP</span></div>
      <h2 id="import-title">Bring your cards in.</h2>
      <p>Choose a Moxfield collection export. Cards are matched to exact set and collector number before import. Other CSVs need name and quantity columns. Files are processed in this browser.</p>
      <label className="button button-primary file-button">Choose CSV file<input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event.target.files?.[0])} /></label>
      {loading && <div className="moxfield-progress" role="status">{progress || 'Resolving set and collector numbers with Scryfall. Large exports may take a few minutes…'}</div>}
      {rows.length > 0 && <section className="moxfield-review" aria-label="Review Moxfield import">
        <div className="moxfield-review-heading"><strong>Review import</strong><span>{rows.length.toLocaleString()} groups matched · {total.toLocaleString()} cards</span></div>
        <div className="moxfield-mode"><label><input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace current collection</label><label><input type="radio" name="import-mode" checked={mode === 'add'} onChange={() => setMode('add')} /> Add to current collection</label></div>
        <div className="moxfield-preview">{rows.slice(0, 10).map((row, index) => <div key={`${row.cardId}-${row.edition}-${row.collectorNumber}-${row.foil}-${index}`}><span>{row.name}</span><small>{row.edition.toUpperCase()} #{row.collectorNumber} · {row.foil ? 'Foil' : 'Nonfoil'} · {row.condition} · {row.language}</small><b>×{row.count}</b></div>)}{rows.length > 10 && <p>And {(rows.length - 10).toLocaleString()} more groups…</p>}</div>
        <div className="moxfield-review-actions"><button className="button button-outline" onClick={() => setRows([])}>Cancel review</button><button className="button button-primary" onClick={() => onImport(rows, mode)}>Confirm {mode === 'replace' ? 'replacement' : 'addition'}</button></div>
      </section>}
      {errors.length > 0 && <ul className="import-errors">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
      {!rows.length && <div className="csv-example"><span>CSV format</span><br />Moxfield export or name,quantity</div>}
    </section>
  </div>
}