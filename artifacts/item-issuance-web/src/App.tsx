import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Archive as ArchiveIcon,
  ArrowDownToLine,
  BarChart3,
  Boxes,
  Check,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Edit3,
  FileArchive,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Menu,
  PackagePlus,
  Plus,
  Printer,
  Search,
  Tag,
  Trash2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  getGetArchiveQueryKey,
  getGetReportSummaryQueryKey,
  getListArchivesQueryKey,
  getListEntriesQueryKey,
  getListItemsQueryKey,
  useArchiveCurrentWeek,
  useCreateEntry,
  useCreateItem,
  useDeleteArchive,
  useDeleteEntry,
  useDeleteItem,
  useGetArchive,
  useGetReportSummary,
  useListArchives,
  useListEntries,
  useListItems,
  useUpdateEntry,
  useUpdateItem,
  type Archive,
  type Entry,
  type EntryInput,
  type Item,
  type ItemInput,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import './index.css';
import './overrides.css';

const queryClient = new QueryClient();
const money = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateTime = (value?: string) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '—';
const dateOnly = (value?: string) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
const TAG_COLORS = ['#2F6A7F', '#D28B1F', '#B94A48', '#6F5B9A', '#3D8A68'];
const PEOPLE_STORAGE_KEY = 'fieldstock-saved-people';
const CATALOG_TYPES = ['Beverages', 'Snacks', 'Sanitary', 'Cleaning', 'Office supplies', 'Tools', 'Other'];
const CATALOG_UNITS = ['Bottle', 'Pack', 'Sachet', 'Piece', 'Box', 'Can', 'Roll', 'Set', 'Other'];

function cn(...classes: Array<string | false | undefined>) { return classes.filter(Boolean).join(' '); }

function readSavedPeople(): string[] {
  try {
    const stored = window.localStorage.getItem(PEOPLE_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function savePeople(people: string[]): void {
  try {
    window.localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(people));
  } catch {
    // The API record still saves if browser storage is unavailable.
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function groupEntriesByPerson(entries: Entry[]): Map<string, Entry[]> {
  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) {
    const personEntries = grouped.get(entry.person) ?? [];
    personEntries.push(entry);
    grouped.set(entry.person, personEntries);
  }
  return grouped;
}

function peopleTotalsFromEntries(entries: Entry[]): Array<{ person: string; quantity: number; total: number; lastIssuedAt: string }> {
  const totals = new Map<string, { person: string; quantity: number; total: number; lastIssuedAt: string }>();
  for (const entry of entries) {
    const current = totals.get(entry.person) ?? { person: entry.person, quantity: 0, total: 0, lastIssuedAt: entry.issuedAt };
    current.quantity += entry.quantity;
    current.total += entry.quantity * entry.unitPrice;
    if (new Date(entry.issuedAt).getTime() > new Date(current.lastIssuedAt).getTime()) current.lastIssuedAt = entry.issuedAt;
    totals.set(entry.person, current);
  }
  return Array.from(totals.values()).sort((a, b) => a.person.localeCompare(b.person));
}

function personItemsHtml(entries: Entry[], peopleTotals: Array<{ person: string; quantity: number; total: number; lastIssuedAt: string }>): string {
  const grouped = groupEntriesByPerson(entries);
  return peopleTotals.map((person) => {
    const itemRows = (grouped.get(person.person) ?? []).map((entry) => `<tr><td>${escapeHtml(entry.itemName)}</td><td>${entry.quantity}</td><td>${escapeHtml(dateTime(entry.issuedAt))}</td><td>${money(entry.quantity * entry.unitPrice)}</td><td>${escapeHtml(entry.remarks || '')}</td></tr>`).join('');
    return `<div class="person-report"><h3>${escapeHtml(person.person)}</h3><table><thead><tr><th>Item taken</th><th>Qty</th><th>Issued</th><th>Value</th><th>Remarks</th></tr></thead><tbody>${itemRows || '<tr><td colspan="5">No item records.</td></tr>'}</tbody></table></div>`;
  }).join('');
}

function exportHtml(entries: Entry[], peopleTotals: Array<{ person: string; quantity: number; total: number; lastIssuedAt: string }>, title: string): string {
  const rows = entries.map((entry) => `<tr><td>${escapeHtml(dateTime(entry.issuedAt))}</td><td>${escapeHtml(entry.person)}</td><td>${escapeHtml(entry.itemName)}</td><td>${entry.quantity}</td><td>${money(entry.unitPrice)}</td><td>${money(entry.quantity * entry.unitPrice)}</td><td>${escapeHtml(entry.remarks)}</td><td>${escapeHtml(entry.tagSymbol ?? '')}</td></tr>`).join('');
  const totals = peopleTotals.map((row) => `<tr><td>${escapeHtml(row.person)}</td><td>${row.quantity}</td><td>${money(row.total)}</td><td>${escapeHtml(dateTime(row.lastIssuedAt))}</td></tr>`).join('');
  const peopleItems = personItemsHtml(entries, peopleTotals);
  return `<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;color:#182b35;padding:24px}h1{font-size:22px}h2{font-size:16px;margin-top:28px}h3{font-size:13px;margin:16px 0 6px}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #ccd5d8;padding:7px;text-align:left;font-size:11px}th{background:#e9f0f1}td:nth-child(2),td:nth-child(4),td:nth-child(5),td:nth-child(6){text-align:right}.person-report{break-inside:avoid;margin-bottom:14px}</style></head><body><h1>${escapeHtml(title)}</h1><p>Generated ${escapeHtml(new Date().toLocaleString('en-PH'))}</p><h2>Items taken by person</h2>${peopleItems || '<p>No active issuance records.</p>'}<h2>Issuance records</h2><table><thead><tr><th>Issued</th><th>Person / crew</th><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th><th>Remarks</th><th>Tag</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No active issuance records.</td></tr>'}</tbody></table><h2>Per-person totals</h2><table><thead><tr><th>Person / crew</th><th>Quantity</th><th>Total</th><th>Last issued</th></tr></thead><tbody>${totals || '<tr><td colspan="4">No totals yet.</td></tr>'}</tbody></table></body></html>`;
}

function downloadReport(entries: Entry[], peopleTotals: Array<{ person: string; quantity: number; total: number; lastIssuedAt: string }>, extension: 'xls' | 'doc', title = 'Item Issuance Tracker'): void {
  const content = exportHtml(entries, peopleTotals, title);
  const mime = extension === 'xls' ? 'application/vnd.ms-excel' : 'application/msword';
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `item-issuance-report.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
}

function printReport(entries: Entry[], peopleTotals: Array<{ person: string; quantity: number; total: number; lastIssuedAt: string }>, title = 'Item Issuance Tracker'): void {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.document.write(exportHtml(entries, peopleTotals, title));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return <div className="space-y-3" aria-label="Loading"><div className="h-4 w-32 skeleton" />{Array.from({ length: count }).map((_, i) => <div key={i} className="h-14 w-full skeleton" />)}</div>;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-mark"><ClipboardList size={20} /></div><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><p className="eyebrow">Workspace action</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose} data-testid="button-close-modal" aria-label="Close"><X size={18} /></button></div>
      {children}
    </div>
  </div>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/items', label: 'Catalog items', icon: Boxes },
    { href: '/entries', label: 'Active entries', icon: ClipboardList },
    { href: '/reports', label: 'Reports & archive', icon: BarChart3 },
  ];
  return <div className="app-frame">
    <button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} data-testid="button-open-menu" aria-label="Open navigation"><Menu size={20} /></button>
    <aside className={cn('sidebar', mobileOpen && 'sidebar-open')}>
      <div className="brand"><div className="brand-mark"><ArrowDownToLine size={19} /></div><div><strong>Fieldstock</strong><span>Item issuance</span></div><button className="mobile-close icon-button" onClick={() => setMobileOpen(false)} data-testid="button-close-menu" aria-label="Close navigation"><X size={18} /></button></div>
      <div className="side-rule" />
      <p className="side-label">Workspace</p>
      <nav>{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={cn('nav-link', location === href || (href !== '/' && location.startsWith(href)) ? 'nav-active' : '')} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} /><span>{label}</span>{location === href && <span className="nav-dot" />}</Link>)}</nav>
      <div className="sidebar-foot"><div className="status-pip"><span /> System ready</div><p>One source of truth for what leaves the shelf.</p></div>
    </aside>
    <main className="main-content">{children}</main>
  </div>;
}

function PageHeader({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-detail">{detail}</p></div>{action}</header>;
}

function StatCard({ label, value, note, icon: Icon, tone }: { label: string; value: string | number; note: string; icon: typeof Boxes; tone: string }) {
  return <div className="stat-card"><div className={cn('stat-icon', tone)}><Icon size={18} /></div><div className="stat-copy"><span>{label}</span><strong data-testid={`text-stat-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</strong><small>{note}</small></div></div>;
}

function Dashboard() {
  const summary = useGetReportSummary();
  const entries = useListEntries();
  const recent = useMemo(() => [...(entries.data ?? [])].sort((a, b) => +new Date(b.issuedAt) - +new Date(a.issuedAt)).slice(0, 6), [entries.data]);
  const stats = summary.data;
  return <AppShell><div className="page-wrap">
    <PageHeader eyebrow="Operational overview" title="Good morning, team." detail="A dependable read on materials moving through your workspace today." action={<Link href="/entries" className="button button-primary" data-testid="link-record-issuance"><Plus size={17} /> Record issuance</Link>} />
    {summary.isLoading ? <LoadingRows count={3} /> : summary.isError ? <ErrorState /> : <div className="stats-grid">
      <StatCard label="Quantity issued" value={stats?.totalQuantity ?? 0} note="Active log, all time" icon={PackagePlus} tone="gold" />
      <StatCard label="Issued value" value={money(stats?.totalPrice ?? 0)} note="At recorded unit price" icon={DollarSign} tone="teal" />
      <StatCard label="People supplied" value={stats?.peopleCount ?? 0} note="Unique recipients" icon={Users} tone="coral" />
      <StatCard label="Catalog items" value={stats?.catalogCount ?? 0} note="Ready to issue" icon={Boxes} tone="blue" />
    </div>}
    <div className="dashboard-grid">
      <section className="panel recent-panel"><div className="panel-head"><div><p className="eyebrow">Live log</p><h2>Recent issuance</h2></div><Link href="/entries" className="text-link" data-testid="link-view-all-entries">View all <ChevronRight size={15} /></Link></div>
        {entries.isLoading ? <LoadingRows /> : entries.isError ? <ErrorState /> : recent.length === 0 ? <EmptyState title="The log is clear." detail="Record your first issuance to start the active trail." action={<Link href="/entries" className="button button-secondary" data-testid="link-start-entry"><Plus size={16} /> Add entry</Link>} /> : <div className="entry-list">{recent.map((entry) => <EntryRow key={entry.id} entry={entry} />)}</div>}
      </section>
      <section className="panel pulse-panel"><div className="panel-head"><div><p className="eyebrow">People supplied</p><h2>Where it is going</h2></div><Users size={19} className="muted-icon" /></div>
        {summary.isLoading ? <LoadingRows count={3} /> : (stats?.peopleTotals?.length ?? 0) === 0 ? <EmptyState title="No recipients yet." detail="People will appear here as items are issued." /> : <div className="people-list">{stats?.peopleTotals.slice(0, 5).map((person, index) => <div className="person-row" key={person.person}><div className="avatar">{person.person.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}</div><div className="person-name"><strong>{person.person}</strong><small>Last issued {dateOnly(person.lastIssuedAt)}</small></div><div className="person-total"><strong>{person.quantity}</strong><small>{money(person.total)}</small></div><div className={cn('rank', index === 0 && 'rank-top')}>{String(index + 1).padStart(2, '0')}</div></div>)}</div>}
        <Link href="/reports" className="panel-foot-link" data-testid="link-open-reports">Open reporting <ChevronRight size={15} /></Link>
      </section>
    </div>
    <section className="quick-strip"><div><p className="eyebrow">Shortcuts</p><strong>Keep the shelf record moving.</strong></div><div className="quick-actions"><Link href="/entries" className="quick-action" data-testid="link-quick-entry"><div><ClipboardList size={17} /></div><span>New issuance<small>Log materials out</small></span><ChevronRight size={15} /></Link><Link href="/items" className="quick-action" data-testid="link-quick-item"><div><PackagePlus size={17} /></div><span>Add catalog item<small>Expand your shelf</small></span><ChevronRight size={15} /></Link><Link href="/reports" className="quick-action" data-testid="link-quick-report"><div><BarChart3 size={17} /></div><span>Close the week<small>Review and archive</small></span><ChevronRight size={15} /></Link></div></section>
  </div></AppShell>;
}

function EntryRow({ entry, compact = false }: { entry: Entry; compact?: boolean }) {
  return <div className={cn('entry-row', compact && 'entry-compact')} data-testid={`row-entry-${entry.id}`}><div className="entry-tag" style={{ background: entry.tagColor ?? 'hsl(var(--primary))' }}>{entry.tagSymbol ?? entry.itemName.slice(0, 1).toUpperCase()}</div><div className="entry-main"><strong>{entry.itemName}</strong><span>{entry.person} · {dateTime(entry.issuedAt)}</span></div><div className="entry-qty"><strong>{entry.quantity}</strong><span>{money(entry.quantity * entry.unitPrice)}</span></div>{entry.tagSymbol && <span className="tag-pill"><Tag size={12} /> {entry.tagSymbol}</span>}</div>;
}

function ErrorState() { return <div className="inline-error"><span>Could not load this section.</span><button className="text-link" onClick={() => window.location.reload()} data-testid="button-retry">Retry</button></div>; }

function ItemForm({ item, onClose }: { item?: Item; onClose: () => void }) {
  const client = useQueryClient();
  const create = useCreateItem(); const update = useUpdateItem();
  const [form, setForm] = useState<ItemInput>({ name: item?.name ?? '', type: item?.type ?? '', price: item?.price ?? 0, unit: item?.unit ?? '' });
  const pending = create.isPending || update.isPending;
  const submit = (e: FormEvent) => { e.preventDefault(); const done = () => { client.invalidateQueries({ queryKey: getListItemsQueryKey() }); client.invalidateQueries({ queryKey: getGetReportSummaryQueryKey() }); onClose(); }; item ? update.mutate({ id: item.id, data: form }, { onSuccess: done }) : create.mutate({ data: form }, { onSuccess: done }); };
  const typeOptions = item?.type && !CATALOG_TYPES.includes(item.type) ? [item.type, ...CATALOG_TYPES] : CATALOG_TYPES;
  const unitOptions = item?.unit && !CATALOG_UNITS.includes(item.unit) ? [item.unit, ...CATALOG_UNITS] : CATALOG_UNITS;
  return <Modal title={item ? 'Edit catalog item' : 'Add catalog item'} onClose={onClose}><form className="form-stack" onSubmit={submit}><label>Item name<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Bottled water" required data-testid="input-item-name" /></label><div className="form-grid"><label>Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required data-testid="input-item-type"><option value="">Select a category</option>{typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label>Unit<select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required data-testid="input-item-unit"><option value="">Select a unit</option>{unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label></div><label>Unit price<input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required data-testid="input-item-price" /></label><div className="form-actions"><button type="button" className="button button-ghost" onClick={onClose} data-testid="button-cancel-item">Cancel</button><button type="submit" className="button button-primary" disabled={pending} data-testid="button-save-item">{pending ? 'Saving…' : <><Check size={16} /> Save item</>}</button></div></form></Modal>;
}

function ItemsPage() {
  const items = useListItems(); const client = useQueryClient(); const remove = useDeleteItem(); const [modal, setModal] = useState<Item | 'new' | null>(null); const [query, setQuery] = useState('');
  const list = useMemo(() => (items.data ?? []).filter((x) => `${x.name} ${x.type} ${x.unit}`.toLowerCase().includes(query.toLowerCase())), [items.data, query]);
  const deleteItem = (item: Item) => { if (window.confirm(`Delete ${item.name}? Its active issuance records will also be removed.`)) remove.mutate({ id: item.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListItemsQueryKey() }); client.invalidateQueries({ queryKey: getListEntriesQueryKey() }); client.invalidateQueries({ queryKey: getGetReportSummaryQueryKey() }); } }); };
  return <AppShell><div className="page-wrap"><PageHeader eyebrow="Catalog" title="Shelf, made legible." detail="Keep the materials your team issues most often close at hand." action={<button className="button button-primary" onClick={() => setModal('new')} data-testid="button-add-item"><Plus size={17} /> Add item</button>} />
    <section className="panel table-panel"><div className="toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search catalog" data-testid="input-search-items" /></div><span className="result-count">{list.length} {list.length === 1 ? 'item' : 'items'}</span></div>
      {items.isLoading ? <LoadingRows count={5} /> : items.isError ? <ErrorState /> : list.length === 0 ? <EmptyState title={query ? 'No matching items.' : 'Your catalog is waiting.'} detail={query ? 'Try a different name or type.' : 'Add the materials your field teams reach for first.'} action={!query && <button className="button button-secondary" onClick={() => setModal('new')} data-testid="button-empty-add-item"><Plus size={16} /> Add first item</button>} /> : <div className="table-wrap"><table><thead><tr><th>Item</th><th>Type</th><th>Unit</th><th>Price</th><th>Added</th><th /></tr></thead><tbody>{list.map((item) => <tr key={item.id} data-testid={`row-item-${item.id}`}><td><div className="table-item"><span className="item-index">{item.name.slice(0, 1).toUpperCase()}</span><strong>{item.name}</strong></div></td><td><span className="soft-pill">{item.type}</span></td><td>{item.unit}</td><td className="mono">{money(item.price)}</td><td className="muted-text">{dateOnly(item.createdAt)}</td><td><div className="row-actions"><button className="icon-button" onClick={() => setModal(item)} aria-label={`Edit ${item.name}`} data-testid={`button-edit-item-${item.id}`}><Edit3 size={16} /></button><button className="icon-button danger-hover" onClick={() => deleteItem(item)} aria-label={`Delete ${item.name}`} data-testid={`button-delete-item-${item.id}`}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div>}
    </section></div>{modal && <ItemForm item={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} />}</AppShell>;
}

function EntryForm({ entry, initialPerson = '', knownPeople = [], items, onClose }: { entry?: Entry; initialPerson?: string; knownPeople?: string[]; items: Item[]; onClose: () => void }) {
  const client = useQueryClient(); const create = useCreateEntry(); const update = useUpdateEntry();
  const [form, setForm] = useState<EntryInput>({ person: entry?.person ?? initialPerson, itemId: entry?.itemId ?? items[0]?.id ?? '', quantity: entry?.quantity ?? 1, remarks: entry?.remarks ?? '', tagSymbol: entry?.tagSymbol ?? null, tagColor: entry?.tagColor ?? null });
  const [savedPeople, setSavedPeople] = useState<string[]>(() => {
    const people = [...(knownPeople ?? []), ...readSavedPeople()].map((person) => person.trim()).filter(Boolean);
    return Array.from(new Map(people.map((person) => [person.toLocaleLowerCase(), person])).values()).sort((a, b) => a.localeCompare(b));
  });
  const pending = create.isPending || update.isPending;
  const rememberPerson = (value: string) => {
    const person = value.trim();
    if (!person) return;
    setSavedPeople((current) => {
      const next = [person, ...current.filter((saved) => saved.toLocaleLowerCase() !== person.toLocaleLowerCase())];
      savePeople(next);
      return next;
    });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const done = () => {
      rememberPerson(form.person);
      client.invalidateQueries({ queryKey: getListEntriesQueryKey() });
      client.invalidateQueries({ queryKey: getGetReportSummaryQueryKey() });
      onClose();
    };
    entry ? update.mutate({ id: entry.id, data: form }, { onSuccess: done }) : create.mutate({ data: form }, { onSuccess: done });
  };
  return <Modal title={entry ? 'Edit issuance record' : 'Record an issuance'} onClose={onClose}><form className="form-stack" onSubmit={submit}><label>Issued to<input autoFocus list="saved-person-names" value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} placeholder="Person or crew name" required data-testid="input-entry-person" /><datalist id="saved-person-names">{savedPeople.map((person) => <option key={person} value={person} />)}</datalist><small className="field-hint">Names are remembered on this device after saving.</small></label><label>Material<select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} required data-testid="select-entry-item">{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {money(item.price)} / {item.unit}</option>)}</select></label><div className="form-grid"><label>Quantity<input type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} required data-testid="input-entry-quantity" /></label><label>Tag symbol <span className="optional">optional</span><input maxLength={4} value={form.tagSymbol ?? ''} onChange={(e) => setForm({ ...form, tagSymbol: e.target.value || null })} placeholder="A1" data-testid="input-entry-tag" /></label></div><div className="tag-picker"><span>Tag color <span className="optional">optional</span></span><div className="tag-swatches">{TAG_COLORS.map((color) => <button type="button" key={color} className={cn('tag-swatch', form.tagColor === color && 'tag-swatch-active')} style={{ background: color }} onClick={() => setForm({ ...form, tagColor: form.tagColor === color ? null : color })} aria-label={`Use tag color ${color}`} />)}</div></div><label>Remarks <span className="optional">optional</span><textarea rows={3} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Job site, vehicle, or context" data-testid="input-entry-remarks" /></label><div className="form-actions"><button type="button" className="button button-ghost" onClick={onClose} data-testid="button-cancel-entry">Cancel</button><button type="submit" className="button button-primary" disabled={pending || !items.length} data-testid="button-save-entry">{pending ? 'Saving…' : <><Check size={16} /> Save issuance</>}</button></div></form></Modal>;
}

function EntriesPage() {
  const entries = useListEntries(); const items = useListItems(); const client = useQueryClient(); const remove = useDeleteEntry(); const [modal, setModal] = useState<Entry | 'new' | null>(null); const [prefillPerson, setPrefillPerson] = useState(''); const [query, setQuery] = useState(''); const [tag, setTag] = useState('all');
  const list = useMemo(() => (entries.data ?? []).filter((x) => `${x.person} ${x.itemName} ${x.remarks}`.toLowerCase().includes(query.toLowerCase())).filter((x) => tag === 'all' || x.tagSymbol === tag), [entries.data, query, tag]);
  const knownPeople = useMemo(() => Array.from(new Set((entries.data ?? []).map((entry) => entry.person))), [entries.data]);
  const tags = useMemo(() => Array.from(new Set((entries.data ?? []).map((e) => e.tagSymbol).filter(Boolean))) as string[], [entries.data]);
  const deleteEntry = (entry: Entry) => { if (window.confirm(`Delete the ${entry.quantity} × ${entry.itemName} issuance for ${entry.person}?`)) remove.mutate({ id: entry.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListEntriesQueryKey() }); client.invalidateQueries({ queryKey: getGetReportSummaryQueryKey() }); } }); };
  const newEntry = (person = '') => { setPrefillPerson(person); setModal('new'); };
  const closeModal = () => { setModal(null); setPrefillPerson(''); };
  return <AppShell><div className="page-wrap"><PageHeader eyebrow="Active issuance" title="Everything that left the shelf." detail="Search, annotate, and keep the active record precise." action={<button className="button button-primary" onClick={() => newEntry()} data-testid="button-record-entry"><Plus size={17} /> Record issuance</button>} />
    <section className="panel table-panel"><div className="toolbar entries-toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search person, item, remarks" data-testid="input-search-entries" /></div><div className="filter-wrap"><Tag size={15} /><select value={tag} onChange={(e) => setTag(e.target.value)} data-testid="select-filter-tag"><option value="all">All tags</option>{tags.map((x) => <option key={x} value={x}>{x}</option>)}</select></div><span className="result-count">{list.length} active</span></div>
       {entries.isLoading ? <LoadingRows count={6} /> : entries.isError ? <ErrorState /> : list.length === 0 ? <EmptyState title={query || tag !== 'all' ? 'No matching records.' : 'Your active log is empty.'} detail={query || tag !== 'all' ? 'Clear the filter or try another search.' : 'Issue an item to create the first active record.'} action={<button className="button button-secondary" onClick={() => newEntry()} data-testid="button-empty-record-entry"><Plus size={16} /> Record issuance</button>} /> : <div className="entry-list full-list">{list.map((entry) => <div key={entry.id} className="entry-card"><EntryRow entry={entry} /><div className="entry-remarks">{entry.remarks || <span>No remarks attached</span>}</div><div className="entry-card-actions"><button className="button button-ghost repeat-button" onClick={() => newEntry(entry.person)}><Plus size={14} /> Add for {entry.person}</button><div className="row-actions"><button className="icon-button" onClick={() => setModal(entry)} aria-label={`Edit entry for ${entry.person}`} data-testid={`button-edit-entry-${entry.id}`}><Edit3 size={16} /></button><button className="icon-button danger-hover" onClick={() => deleteEntry(entry)} aria-label={`Delete entry for ${entry.person}`} data-testid={`button-delete-entry-${entry.id}`}><Trash2 size={16} /></button></div></div></div>)}</div>}
      </section></div>{modal && <EntryForm entry={modal === 'new' ? undefined : modal} initialPerson={prefillPerson} knownPeople={knownPeople} items={items.data ?? []} onClose={closeModal} />}</AppShell>;
}

function ReportsPage() {
  const summary = useGetReportSummary(); const entries = useListEntries(); const archives = useListArchives(); const archive = useArchiveCurrentWeek(); const client = useQueryClient();
  const peopleTotals = summary.data?.peopleTotals ?? [];
  const exportCsv = () => { const rows = peopleTotals; const csv = ['Person,Quantity,Total,Last issued', ...rows.map((x) => [x.person, x.quantity, x.total, x.lastIssuedAt].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))].join('\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = 'item-issuance-people-totals.csv'; link.click(); URL.revokeObjectURL(url); };
  const closeWeek = () => { if (window.confirm('Archive all active issuance records for this week? This clears the active log.')) archive.mutate(undefined, { onSuccess: () => { client.invalidateQueries({ queryKey: getListArchivesQueryKey() }); client.invalidateQueries({ queryKey: getListEntriesQueryKey() }); client.invalidateQueries({ queryKey: getGetReportSummaryQueryKey() }); } }); };
  return <AppShell><div className="page-wrap"><PageHeader eyebrow="Reporting" title="Make the record useful." detail="See who received what, export the numbers, and close the week cleanly." action={<button className="button button-primary" onClick={closeWeek} disabled={archive.isPending} data-testid="button-archive-week"><ArchiveIcon size={17} /> {archive.isPending ? 'Archiving…' : 'Close active week'}</button>} />
    {summary.isLoading ? <LoadingRows count={4} /> : summary.isError ? <ErrorState /> : <div className="report-top"><div className="report-callout"><div className="callout-icon"><TrendingUp size={19} /></div><div><p className="eyebrow">Active period</p><strong>{summary.data?.totalQuantity ?? 0} items issued</strong><span>{money(summary.data?.totalPrice ?? 0)} recorded across {summary.data?.peopleCount ?? 0} people</span></div></div><button className="button button-secondary" onClick={exportCsv} data-testid="button-export-csv"><ArrowDownToLine size={16} /> Export people totals</button></div>}
      <section className="panel table-panel"><div className="panel-head"><div><p className="eyebrow">Breakdown</p><h2>Per-person totals</h2></div><div className="report-actions"><button className="button button-ghost" onClick={() => printReport(entries.data ?? [], peopleTotals)} data-testid="button-print-report"><Printer size={15} /> Print / PDF</button><button className="button button-ghost" onClick={() => downloadReport(entries.data ?? [], peopleTotals, 'xls')} data-testid="button-export-xls"><FileSpreadsheet size={15} /> Excel .xls</button><button className="button button-ghost" onClick={() => downloadReport(entries.data ?? [], peopleTotals, 'doc')} data-testid="button-export-doc"><FileText size={15} /> Word .doc</button><button className="button button-secondary" onClick={exportCsv} data-testid="button-export-csv"><ArrowDownToLine size={15} /> CSV</button><span className="soft-pill">{peopleTotals.length} recipients</span></div></div>{peopleTotals.length ? <div className="table-wrap"><table><thead><tr><th>Person / crew</th><th>Quantity</th><th>Total value</th><th>Last issued</th></tr></thead><tbody>{peopleTotals.map((x) => <tr key={x.person}><td><div className="table-item"><span className="avatar small">{x.person.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}</span><strong>{x.person}</strong></div></td><td className="mono">{x.quantity}</td><td className="mono">{money(x.total)}</td><td className="muted-text">{dateTime(x.lastIssuedAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="No totals yet." detail="Per-person reporting will build as active entries come in." />}</section>
    <section className="archive-section"><div className="section-title"><div><p className="eyebrow">History</p><h2>Weekly archives</h2></div><span className="section-note">Closed periods stay available for reference.</span></div>{archives.isLoading ? <LoadingRows count={3} /> : archives.isError ? <ErrorState /> : archives.data?.length ? <div className="archive-grid">{archives.data.map((a) => <ArchiveCard key={a.id} archive={a} />)}</div> : <div className="archive-empty"><FileArchive size={21} /><div><strong>No archives yet.</strong><span>Close the active week when your field record is ready.</span></div></div>}</section>
  </div></AppShell>;
}

function ArchiveCard({ archive }: { archive: Archive }) {
  return <Link href={`/reports/archive/${archive.id}`} className="archive-card" data-testid={`link-archive-${archive.id}`}><div className="archive-card-top"><div className="archive-icon"><FileArchive size={18} /></div><ChevronRight size={17} /></div><strong>{archive.label}</strong><span>{dateOnly(archive.archivedAt)} · {archive.entries.length} records</span><div className="archive-card-foot"><b>{archive.totalQuantity} items</b><b>{money(archive.totalPrice)}</b></div></Link>;
}

function ArchiveDetailPage() {
  const { id = '' } = useParams<{ id: string }>(); const [, setLocation] = useLocation(); const archive = useGetArchive(id, { query: { enabled: Boolean(id), queryKey: getGetArchiveQueryKey(id) } }); const remove = useDeleteArchive(); const client = useQueryClient();
  const deleteArchive = () => { if (window.confirm('Delete this archive permanently?')) remove.mutate({ id }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListArchivesQueryKey() }); setLocation('/reports'); } }); };
  const peopleTotals = archive.data ? peopleTotalsFromEntries(archive.data.entries) : [];
  return <AppShell><div className="page-wrap">{archive.isLoading ? <LoadingRows count={5} /> : archive.isError || !archive.data ? <ErrorState /> : <><PageHeader eyebrow="Archive detail" title={archive.data.label} detail={`Closed ${dateOnly(archive.data.archivedAt)} · ${archive.data.entries.length} issuance records`} action={<div className="header-actions"><Link href="/reports" className="button button-ghost" data-testid="link-back-reports">Back to reports</Link><button className="button button-danger" onClick={deleteArchive} disabled={remove.isPending} data-testid="button-delete-archive"><Trash2 size={16} /> Delete archive</button></div>} /><div className="archive-summary"><StatCard label="Quantity issued" value={archive.data.totalQuantity} note="Archived records" icon={PackagePlus} tone="gold" /><StatCard label="Issued value" value={money(archive.data.totalPrice)} note="At recorded unit price" icon={DollarSign} tone="teal" /></div><section className="panel table-panel"><div className="panel-head"><div><p className="eyebrow">Archived log</p><h2>Issuance records</h2></div><div className="report-actions"><button className="button button-ghost" onClick={() => printReport(archive.data.entries, peopleTotals, archive.data.label)} data-testid="button-print-archive"><Printer size={15} /> Print / PDF</button><button className="button button-ghost" onClick={() => downloadReport(archive.data.entries, peopleTotals, 'xls', archive.data.label)} data-testid="button-export-archive-xls"><FileSpreadsheet size={15} /> Excel .xls</button><button className="button button-ghost" onClick={() => downloadReport(archive.data.entries, peopleTotals, 'doc', archive.data.label)} data-testid="button-export-archive-doc"><FileText size={15} /> Word .doc</button></div></div><div className="entry-list full-list">{archive.data.entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)}</div></section></>}</div></AppShell>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Dashboard} /><Route path="/items" component={ItemsPage} /><Route path="/entries" component={EntriesPage} /><Route path="/reports/archive/:id" component={ArchiveDetailPage} /><Route path="/reports" component={ReportsPage} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;