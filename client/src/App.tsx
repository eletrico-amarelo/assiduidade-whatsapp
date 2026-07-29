import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  FolderOpen,
  Download,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  analyseFile,
  analyseStoredExport,
  changeImportedMessages,
  exportCompleteMonths,
  listStoredExports,
  loadRules,
  resetRules as resetStoredRules,
  saveRules as saveStoredRules,
} from './api';
import { Badge, Button, Card } from './components/ui';
import type {
  AnalysisResponse,
  AttendanceConfig,
  AttendanceDay,
  DayStatus,
  PeriodRule,
  StoredExport,
} from './types';

const DEFAULT_CONFIG: AttendanceConfig = {
  periods: [
    { id: 'morning', label: 'Manhã', start: '08:00', end: '13:30' },
    { id: 'afternoon', label: 'Tarde', start: '13:30', end: '20:00' },
  ],
  aliases: {
    in: ['IN', 'ENTRADA', 'CHECK IN', 'CHECK-IN'],
    out: ['OUT', 'SAÍDA', 'SAIDA', 'CHECK OUT', 'CHECK-OUT'],
  },
  ignoredMessagePatterns: [],
  toleranceMinutes: 15,
  vacations: [],
  workingDays: [1, 2, 3, 4, 5],
};

const weekdayLabels = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

const statusMeta: Record<DayStatus, { label: string; colour: string }> = {
  complete: { label: 'Completo', colour: '#2dbd85' },
  partial: { label: 'Incompleto', colour: '#ffb347' },
  absent: { label: 'Sem registos', colour: '#ef6673' },
  holiday: { label: 'Feriado', colour: '#b85445' },
  vacation: { label: 'Férias', colour: '#3b82f6' },
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short' }).format(
    new Date(`${date}T12:00:00`),
  );
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [config, setConfig] = useState<AttendanceConfig>(DEFAULT_CONFIG);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [participant, setParticipant] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [storedExports, setStoredExports] = useState<StoredExport[]>([]);
  const [showFileChooser, setShowFileChooser] = useState(false);
  const [inAliasesText, setInAliasesText] = useState(DEFAULT_CONFIG.aliases.in.join(', '));
  const [outAliasesText, setOutAliasesText] = useState(DEFAULT_CONFIG.aliases.out.join(', '));
  const [rulesSource, setRulesSource] = useState<'saved' | 'default'>('default');
  const [isSavingRules, setIsSavingRules] = useState(false);

  useEffect(() => {
    let active = true;
    loadRules()
      .then((rules) => {
        if (!active) return;
        setConfig(rules.config);
        setInAliasesText(rules.config.aliases.in.join(', '));
        setOutAliasesText(rules.config.aliases.out.join(', '));
        setRulesSource(rules.source);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as regras.');
      });
    listStoredExports()
      .then((files) => {
        if (!active) return;
        setStoredExports(files);
        setShowFileChooser(files.length > 0);
      })
      .catch(() => {
        // A consulta inicial não deve impedir uma nova importação.
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedDays = useMemo(
    () => result?.days.filter((day) => day.participant === participant) ?? [],
    [participant, result],
  );

  const selectedSummary = result?.summaries.find((summary) => summary.participant === participant);

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith('.txt')) {
      setError('Seleciona uma exportação do WhatsApp em formato .txt.');
      return;
    }
    setFile(nextFile);
    setError('');
    setResult(null);
  }

  async function submit() {
    if (!file) {
      setError('Seleciona primeiro um ficheiro .txt.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const analysis = await analyseFile(file, config);
      setResult(analysis);
      setParticipant(analysis.participants[0] ?? '');
      setActionMessage('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ocorreu um erro inesperado.');
    } finally {
      setIsLoading(false);
    }
  }

  async function exportMonths() {
    if (!result) return;
    setIsSaving(true);
    setError('');
    try {
      const exported = await exportCompleteMonths(result.importId);
      const created = exported.created.length
        ? `${exported.created.length} ficheiro(s) criado(s): ${exported.created.join(', ')}.`
        : 'Não havia novos meses completos para exportar.';
      const skipped = exported.skipped.length
        ? ` ${exported.skipped.length} já existia(m) e foi/foram ignorado(s).`
        : '';
      setActionMessage(`${created}${skipped}`);
      setResult((current) => current ? {
        ...current,
        monthlyExports: current.monthlyExports.map((item) => ({ ...item, exists: true })),
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível exportar os meses.');
    } finally {
      setIsSaving(false);
    }
  }

  async function openStoredExport(filename: string) {
    setIsLoading(true);
    setError('');
    try {
      const analysis = await analyseStoredExport(filename, config);
      setResult(analysis);
      setParticipant(analysis.participants[0] ?? '');
      setShowFileChooser(false);
      setActionMessage(`${filename} aberto sem alterar o ficheiro guardado.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o ficheiro.');
    } finally {
      setIsLoading(false);
    }
  }

  async function saveMessageChange(sourceLine: number, change: { text?: string; remove?: boolean }) {
    if (!result) return;
    setIsSaving(true);
    setError('');
    try {
      const analysis = await changeImportedMessages(result.importId, config, [{ sourceLine, ...change }]);
      setResult(analysis);
      setParticipant((current) => analysis.participants.includes(current) ? current : analysis.participants[0] ?? '');
      setEditingLine(null);
      setActionMessage(`Alterações guardadas em ${analysis.editedFilename}. O ficheiro original foi mantido.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível guardar as alterações.');
    } finally {
      setIsSaving(false);
    }
  }

  async function persistRules() {
    setIsSavingRules(true);
    setError('');
    try {
      const saved = await saveStoredRules(config);
      setConfig(saved.config);
      setRulesSource(saved.source);
      setActionMessage('Regras guardadas em data/config/regras.json. Serão usadas nas próximas análises.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível guardar as regras.');
    } finally {
      setIsSavingRules(false);
    }
  }

  async function restoreDefaultRules() {
    if (!window.confirm('Repor as regras iniciais? A configuração atual será mantida num ficheiro de backup.')) return;
    setIsSavingRules(true);
    setError('');
    try {
      const restored = await resetStoredRules();
      setConfig(restored.config);
      setInAliasesText(restored.config.aliases.in.join(', '));
      setOutAliasesText(restored.config.aliases.out.join(', '));
      setRulesSource(restored.source);
      setActionMessage('Regras iniciais repostas. A configuração anterior foi guardada como backup.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível repor as regras.');
    } finally {
      setIsSavingRules(false);
    }
  }

  function addVacation() {
    setConfig((current) => ({
      ...current,
      vacations: [
        ...current.vacations,
        {
          id: crypto.randomUUID(),
          participant: participant || current.vacations[0]?.participant || '',
          from: '',
          to: '',
          description: '',
        },
      ],
    }));
  }

  function updateVacation(id: string, patch: Partial<AttendanceConfig['vacations'][number]>) {
    setConfig((current) => ({
      ...current,
      vacations: current.vacations.map((vacation) =>
        vacation.id === id ? { ...vacation, ...patch } : vacation,
      ),
    }));
  }

  function removeVacation(id: string) {
    setConfig((current) => ({
      ...current,
      vacations: current.vacations.filter((vacation) => vacation.id !== id),
    }));
  }

  function updatePeriod(index: number, patch: Partial<PeriodRule>) {
    setConfig((current) => ({
      ...current,
      periods: current.periods.map((period, periodIndex) =>
        periodIndex === index ? { ...period, ...patch } : period,
      ),
    }));
  }

  function toggleWorkingDay(day: number) {
    setConfig((current) => ({
      ...current,
      workingDays: current.workingDays.includes(day)
        ? current.workingDays.filter((item) => item !== day)
        : [...current.workingDays, day],
    }));
  }

  const chartData = selectedDays.map((day) => ({
    date: formatDate(day.date),
    fullDate: day.date,
    score: day.score,
    status: day.status,
    holidayName: day.holidayName,
    vacationDescription: day.vacationDescription,
  }));

  return (
    <main className="app-shell">
      {showFileChooser && (
        <div className="dialog-backdrop" role="presentation">
          <Card className="startup-dialog" role="dialog" aria-modal="true" aria-labelledby="startup-dialog-title">
            <div className="startup-dialog-heading">
              <span className="dialog-icon"><FolderOpen size={21} /></span>
              <div>
                <h2 id="startup-dialog-title">Continuar com um ficheiro existente?</h2>
                <p>Encontrámos exportações guardadas. Podes abrir uma delas ou iniciar uma nova importação.</p>
              </div>
            </div>
            <div className="stored-file-list">
              {storedExports.map((storedFile) => (
                <button
                  key={storedFile.filename}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void openStoredExport(storedFile.filename)}
                >
                  <FileText size={18} />
                  <span>
                    <strong>{storedFile.filename}</strong>
                    <small>
                      {(storedFile.size / 1024).toFixed(1)} KB · {new Intl.DateTimeFormat('pt-PT', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(storedFile.updatedAt))}
                    </small>
                  </span>
                  {storedFile.edited && <Badge variant="warning">Editado</Badge>}
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
            <div className="startup-dialog-actions">
              <Button variant="outline" type="button" onClick={() => setShowFileChooser(false)}>
                <Plus size={16} /> Nova importação
              </Button>
            </div>
            {error && <div className="error-message" role="alert">{error}</div>}
          </Card>
        </div>
      )}

      <nav className="topbar">
        <a className="brand" href="/" aria-label="Ponto início">
          <span className="brand-mark"><Clock3 size={18} /></span>
          <span>Ponto</span>
        </a>
        <Badge>Relatórios de assiduidade</Badge>
      </nav>

      <header className="hero">
        <div>
          <Badge><FileText size={13} /> Importação WhatsApp</Badge>
          <h1>Transforma picagens em <span>assiduidade clara.</span></h1>
          <p>
            Carrega uma conversa exportada, valida automaticamente os pares IN/OUT e obtém um relatório diário pronto a consultar.
          </p>
        </div>
        <div className="rule-summary" aria-label="Regra atual">
          <div className="rule-summary-icon"><CheckCircle2 size={18} /></div>
          <div>
            <span>Regra diária</span>
            <strong>2 pares IN <ArrowRight size={14} /> OUT</strong>
            <small>manhã e tarde</small>
          </div>
        </div>
      </header>

      <Card className="upload-panel">
        <div
          className={`drop-zone ${isDragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            chooseFile(event.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => event.key === 'Enter' && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".txt,text/plain"
            hidden
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
          <div className="upload-icon" aria-hidden="true"><UploadCloud size={24} /></div>
          <div>
            <strong>{file ? file.name : 'Arrasta para aqui a exportação do WhatsApp'}</strong>
            <span>
              {file ? `${(file.size / 1024).toFixed(1)} KB · pronto para analisar` : 'ou clica para escolher um ficheiro .txt'}
            </span>
          </div>
        </div>

        <div className="upload-actions">
          <Button variant="outline" type="button" onClick={() => setShowRules((value) => !value)}>
            <Settings2 size={16} />
            {showRules ? 'Ocultar regras' : 'Configurar regras'}
            <ChevronDown size={15} className={showRules ? 'rotate-icon' : ''} />
          </Button>
          <Button type="button" disabled={!file || isLoading} onClick={submit}>
            {isLoading ? 'A analisar…' : <>Criar relatório <ArrowRight size={16} /></>}
          </Button>
        </div>

        {showRules && (
          <>
            <div className="rules-toolbar">
              <div>
                <strong>Configuração de regras</strong>
                <Badge variant={rulesSource === 'saved' ? 'success' : 'secondary'}>
                  {rulesSource === 'saved' ? 'regras.json ativo' : 'regras iniciais'}
                </Badge>
              </div>
              <div>
                <Button variant="outline" type="button" disabled={isSavingRules} onClick={() => void restoreDefaultRules()}>
                  <RotateCcw size={15} /> Repor iniciais
                </Button>
                <Button type="button" disabled={isSavingRules} onClick={() => void persistRules()}>
                  <Save size={15} /> {isSavingRules ? 'A guardar…' : 'Guardar regras'}
                </Button>
              </div>
            </div>
            <div className="rules-grid">
            <div className="rule-card">
              <h2>Períodos</h2>
              {config.periods.map((period, index) => (
                <div className="period-row" key={period.id}>
                  <label>
                    Nome
                    <input value={period.label} onChange={(event) => updatePeriod(index, { label: event.target.value })} />
                  </label>
                  <label>
                    Início
                    <input type="time" value={period.start} onChange={(event) => updatePeriod(index, { start: event.target.value })} />
                  </label>
                  <label>
                    Fim
                    <input type="time" value={period.end} onChange={(event) => updatePeriod(index, { end: event.target.value })} />
                  </label>
                </div>
              ))}
              <label className="tolerance-field">
                Tolerância antes/depois (minutos)
                <input
                  type="number"
                  min="0"
                  max="120"
                  step="1"
                  value={config.toleranceMinutes}
                  onChange={(event) => setConfig((current) => ({
                    ...current,
                    toleranceMinutes: Number(event.target.value),
                  }))}
                />
              </label>
            </div>

            <div className="rule-card">
              <h2>Calendário</h2>
              <div className="date-row">
                <label>
                  De
                  <input type="date" value={config.dateFrom ?? ''} onChange={(event) => setConfig((current) => ({ ...current, dateFrom: event.target.value || undefined }))} />
                </label>
                <label>
                  Até
                  <input type="date" value={config.dateTo ?? ''} onChange={(event) => setConfig((current) => ({ ...current, dateTo: event.target.value || undefined }))} />
                </label>
              </div>
              <div className="weekday-picker" aria-label="Dias úteis">
                {weekdayLabels.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    className={config.workingDays.includes(day.value) ? 'active' : ''}
                    onClick={() => toggleWorkingDay(day.value)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              <p className="calendar-note">
                Os feriados nacionais portugueses são excluídos automaticamente. Carnaval e feriados municipais não são considerados.
              </p>
            </div>

            <div className="rule-card aliases-card">
              <h2>Palavras reconhecidas</h2>
              <label>
                IN (separar por vírgulas)
                <input
                  value={inAliasesText}
                  onChange={(event) => {
                    const value = event.target.value;
                    setInAliasesText(value);
                    setConfig((current) => ({
                      ...current,
                      aliases: { ...current.aliases, in: value.split(',').map((item) => item.trim()).filter(Boolean) },
                    }));
                  }}
                />
              </label>
              <label>
                OUT (separar por vírgulas)
                <input
                  value={outAliasesText}
                  onChange={(event) => {
                    const value = event.target.value;
                    setOutAliasesText(value);
                    setConfig((current) => ({
                      ...current,
                      aliases: { ...current.aliases, out: value.split(',').map((item) => item.trim()).filter(Boolean) },
                    }));
                  }}
                />
              </label>
            </div>

            <div className="rule-card ignored-patterns-card">
              <h2>Mensagens a ignorar</h2>
              <p>Adiciona uma expressão por linha. A mensagem será ignorada quando contiver esse texto, independentemente de maiúsculas ou acentos.</p>
              <label>
                Textos ou expressões
                <textarea
                  rows={5}
                  placeholder={'Mensagem eliminada\nAs mensagens e chamadas são protegidas\nalterou o assunto'}
                  value={config.ignoredMessagePatterns.join('\n')}
                  onChange={(event) => setConfig((current) => ({
                    ...current,
                    ignoredMessagePatterns: event.target.value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }))}
                />
              </label>
            </div>

            <div className="rule-card vacations-card">
              <div className="vacations-heading">
                <div>
                  <h2>Férias dos participantes</h2>
                  <p>Os dias de férias aparecem no gráfico mas não contam para a taxa de assiduidade.</p>
                </div>
                <Button variant="outline" type="button" onClick={addVacation}>
                  <Plus size={15} /> Adicionar férias
                </Button>
              </div>
              {config.vacations.length === 0 ? (
                <div className="vacations-empty"><CalendarOff size={20} /> Ainda não existem períodos de férias.</div>
              ) : (
                <div className="vacations-list">
                  {config.vacations.map((vacation) => (
                    <div className="vacation-row" key={vacation.id}>
                      <label>
                        Participante
                        <input
                          list="participant-names"
                          value={vacation.participant}
                          onChange={(event) => updateVacation(vacation.id, { participant: event.target.value })}
                        />
                      </label>
                      <label>
                        De
                        <input type="date" value={vacation.from} onChange={(event) => updateVacation(vacation.id, { from: event.target.value })} />
                      </label>
                      <label>
                        Até
                        <input type="date" value={vacation.to} onChange={(event) => updateVacation(vacation.id, { to: event.target.value })} />
                      </label>
                      <label>
                        Descrição
                        <input value={vacation.description ?? ''} onChange={(event) => updateVacation(vacation.id, { description: event.target.value })} />
                      </label>
                      <Button variant="outline" size="icon" type="button" aria-label="Remover férias" onClick={() => removeVacation(vacation.id)}>
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <datalist id="participant-names">
                {result?.participants.map((name) => <option key={name} value={name} />)}
              </datalist>
            </div>
            </div>
          </>
        )}

        {error && <div className="error-message" role="alert">{error}</div>}
      </Card>

      {result && (
        <>
          <section className="result-toolbar">
            <div>
              <Badge><FileText size={13} /> {result.filename}</Badge>
              <h2>Resultado da análise</h2>
              <p>{result.recognisedPunches} picagens reconhecidas em {result.totalMessages} mensagens.</p>
            </div>
            <div className="result-actions">
              <a
                className="ui-button ui-button-outline view-file-button"
                href={`/api/analyse/imports/${result.importId}/file`}
                target="_blank"
                rel="noreferrer"
              >
                <Eye size={16} /> Ver ficheiro
              </a>
              <label className="participant-select">
                Participante
                <select value={participant} onChange={(event) => setParticipant(event.target.value)}>
                  {result.participants.map((name) => <option key={name}>{name}</option>)}
                </select>
              </label>
            </div>
          </section>

          <Card className="export-panel">
            <div>
              <span className="eyebrow">Exportação mensal</span>
              <h3>Meses completos</h3>
              <p>
                {result.monthlyExports.length > 0
                  ? `${result.monthlyExports.length} mês/meses completo(s) disponível(eis).`
                  : 'Este ficheiro não contém nenhum mês completo.'}
              </p>
              {result.monthlyExports.length > 0 && (
                <div className="monthly-file-list">
                  {result.monthlyExports.map((item) => (
                    item.exists ? (
                      <a
                        className="monthly-file-link"
                        key={item.filename}
                        href={`/api/analyse/exports/${encodeURIComponent(item.filename)}`}
                        download
                      >
                        <Download size={12} /> {item.filename}
                      </a>
                    ) : (
                      <Badge key={item.filename} variant="success">{item.filename}</Badge>
                    )
                  ))}
                </div>
              )}
            </div>
            <Button
              type="button"
              disabled={result.monthlyExports.length === 0 || isSaving}
              onClick={exportMonths}
            >
              <Download size={16} /> Exportar meses
            </Button>
          </Card>

          {actionMessage && <div className="action-message" role="status">{actionMessage}</div>}

          {selectedSummary && (
            <section className="summary-grid">
              <SummaryCard icon={<CheckCircle2 size={18} />} label="Taxa de assiduidade" value={`${selectedSummary.attendanceRate}%`} accent="positive" />
              <SummaryCard icon={<CalendarDays size={18} />} label="Dias completos" value={selectedSummary.completeDays} />
              <SummaryCard icon={<Clock3 size={18} />} label="Dias incompletos" value={selectedSummary.partialDays} accent="warning" />
              <SummaryCard icon={<Users size={18} />} label="Sem registos" value={selectedSummary.absentDays} accent="danger" />
            </section>
          )}

          <Card className="chart-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Evolução diária</span>
                <h2>Gráfico de assiduidade</h2>
              </div>
              <div className="legend">
                {Object.entries(statusMeta).map(([status, meta]) => (
                  <span key={status}><i style={{ background: meta.colour }} />{meta.label}</span>
                ))}
              </div>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 8, left: -12, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#26364b" />
                  <XAxis dataKey="date" tick={{ fill: '#aab8c8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: '#aab8c8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<AttendanceTooltip />} cursor={{ fill: 'rgba(255,255,255,.035)' }} />
                  <Bar dataKey="score" radius={[7, 7, 2, 2]} maxBarSize={36}>
                    {chartData.map((entry) => <Cell key={entry.fullDate} fill={statusMeta[entry.status].colour} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="details-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Auditoria</span>
                <h2>Detalhe por dia</h2>
              </div>
              <span className="record-count">{selectedDays.length} dias</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    {result.config.periods.map((period) => <th key={period.id}>{period.label}</th>)}
                    <th>Estado</th>
                    <th>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDays.map((day) => <AttendanceRow key={`${day.participant}-${day.date}`} day={day} />)}
                </tbody>
              </table>
            </div>
          </Card>

          {(result.warnings.length > 0 || result.ignoredMessages > 0 || result.excludedMessages > 0) && (
            <section className="notice-panel">
              <strong>Notas de importação</strong>
              {result.excludedMessages > 0 && (
                <p>{result.excludedMessages} mensagens foram ocultadas pelas regras configuradas.</p>
              )}
              {result.ignoredMessages > 0 && (
                <>
                  <p>{result.ignoredMessages} mensagens não correspondiam a picagens:</p>
                  <div className="ignored-message-list">
                    {result.ignoredMessageDetails.map((message) => (
                      <article key={`${message.sourceLine}-${message.date}-${message.time}`}>
                        <div className="ignored-message-meta">
                          <span>{formatLongDate(message.date)} · {message.time}</span>
                          <span>{message.author ?? 'Mensagem do sistema'}</span>
                        </div>
                        {editingLine === message.sourceLine ? (
                          <div className="message-editor">
                            <textarea
                              value={editingText}
                              onChange={(event) => setEditingText(event.target.value)}
                              rows={3}
                              autoFocus
                            />
                            <div>
                              <Button
                                type="button"
                                disabled={!editingText.trim() || isSaving}
                                onClick={() => saveMessageChange(message.sourceLine, { text: editingText })}
                              >
                                <Save size={15} /> Guardar
                              </Button>
                              <Button variant="outline" type="button" onClick={() => setEditingLine(null)}>
                                <X size={15} /> Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p>{message.text || 'Mensagem sem conteúdo'}</p>
                            <div className="message-actions">
                              <Button
                                variant="outline"
                                type="button"
                                onClick={() => {
                                  setEditingLine(message.sourceLine);
                                  setEditingText(message.text);
                                }}
                              >
                                <Pencil size={14} /> Editar
                              </Button>
                              <Button
                                variant="outline"
                                type="button"
                                disabled={isSaving}
                                onClick={() => {
                                  if (window.confirm('Remover esta mensagem da cópia editada? O original será mantido.')) {
                                    void saveMessageChange(message.sourceLine, { remove: true });
                                  }
                                }}
                              >
                                <Trash2 size={14} /> Remover
                              </Button>
                            </div>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                </>
              )}
              {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </section>
          )}
        </>
      )}
    </main>
  );
}

function SummaryCard({ icon, label, value, accent = 'default' }: { icon: ReactNode; label: string; value: string | number; accent?: 'default' | 'positive' | 'warning' | 'danger' }) {
  return (
    <article className={`summary-card ${accent}`}>
      <div className="summary-card-heading"><span>{label}</span><i>{icon}</i></div>
      <strong>{value}</strong>
    </article>
  );
}

function AttendanceTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { fullDate: string; score: number; status: DayStatus; holidayName?: string; vacationDescription?: string } }> }) {
  if (!active || !payload?.[0]) return null;
  const entry = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{formatLongDate(entry.fullDate)}</strong>
      <span>
        {entry.status === 'holiday'
          ? `Feriado nacional · ${entry.holidayName ?? ''}`
          : entry.status === 'vacation'
            ? `Férias${entry.vacationDescription ? ` · ${entry.vacationDescription}` : ''}`
            : `${statusMeta[entry.status].label} · ${entry.score}%`}
      </span>
    </div>
  );
}

function AttendanceRow({ day }: { day: AttendanceDay }) {
  return (
    <tr>
      <td>
        <strong>{formatLongDate(day.date)}</strong>
        <small>{day.weekday}</small>
      </td>
      {day.periods.map((period) => (
        <td key={period.periodId}>
          <div className={`period-pill ${day.status === 'holiday' ? 'holiday' : day.status === 'vacation' ? 'vacation' : period.complete ? 'complete' : 'incomplete'}`}>
            <span>{period.inTime ?? '—'}</span>
            <i>→</i>
            <span>{period.outTime ?? '—'}</span>
          </div>
        </td>
      ))}
      <td><span className={`status-badge ${day.status}`}>{statusMeta[day.status].label}</span></td>
      <td className="issues-cell">
        {day.holidayName
          ? `Feriado nacional: ${day.holidayName}`
          : day.status === 'vacation'
            ? `Férias${day.vacationDescription ? `: ${day.vacationDescription}` : ''}`
            : day.issues.length ? day.issues.join(' · ') : 'Sem ocorrências'}
      </td>
    </tr>
  );
}

export default App;
