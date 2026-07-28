import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Settings2,
  UploadCloud,
  Users,
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
import { analyseFile } from './api';
import { Badge, Button, Card } from './components/ui';
import type {
  AnalysisResponse,
  AttendanceConfig,
  AttendanceDay,
  DayStatus,
  PeriodRule,
} from './types';

const DEFAULT_CONFIG: AttendanceConfig = {
  periods: [
    { id: 'morning', label: 'Manhã', start: '09:00', end: '13:30' },
    { id: 'afternoon', label: 'Tarde', start: '13:31', end: '19:00' },
  ],
  aliases: {
    in: ['IN', 'ENTRADA', 'CHECK IN', 'CHECK-IN'],
    out: ['OUT', 'SAÍDA', 'SAIDA', 'CHECK OUT', 'CHECK-OUT'],
  },
  ignoredMessagePatterns: [],
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ocorreu um erro inesperado.');
    } finally {
      setIsLoading(false);
    }
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
  }));

  return (
    <main className="app-shell">
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
            </div>

            <div className="rule-card aliases-card">
              <h2>Palavras reconhecidas</h2>
              <label>
                IN (separar por vírgulas)
                <input
                  value={config.aliases.in.join(', ')}
                  onChange={(event) => setConfig((current) => ({
                    ...current,
                    aliases: { ...current.aliases, in: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) },
                  }))}
                />
              </label>
              <label>
                OUT (separar por vírgulas)
                <input
                  value={config.aliases.out.join(', ')}
                  onChange={(event) => setConfig((current) => ({
                    ...current,
                    aliases: { ...current.aliases, out: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) },
                  }))}
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
          </div>
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
            <label className="participant-select">
              Participante
              <select value={participant} onChange={(event) => setParticipant(event.target.value)}>
                {result.participants.map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>
          </section>

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
                        <p>{message.text || 'Mensagem sem conteúdo'}</p>
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

function AttendanceTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { fullDate: string; score: number; status: DayStatus } }> }) {
  if (!active || !payload?.[0]) return null;
  const entry = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{formatLongDate(entry.fullDate)}</strong>
      <span>{statusMeta[entry.status].label} · {entry.score}%</span>
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
          <div className={`period-pill ${period.complete ? 'complete' : 'incomplete'}`}>
            <span>{period.inTime ?? '—'}</span>
            <i>→</i>
            <span>{period.outTime ?? '—'}</span>
          </div>
        </td>
      ))}
      <td><span className={`status-badge ${day.status}`}>{statusMeta[day.status].label}</span></td>
      <td className="issues-cell">
        {day.issues.length ? day.issues.join(' · ') : 'Sem ocorrências'}
      </td>
    </tr>
  );
}

export default App;
