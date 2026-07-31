"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserPlus, Trash2, TrendingUp, Upload, Share2, Calendar, Tag, CheckCircle2, Clock, AlertTriangle, Pencil, Download, LayoutGrid, List } from "lucide-react";
import { ListPageLayout } from "@/components/layouts/list-page-layout";
import { CsvImportDialog } from "@/components/shared/csv-import-dialog";
import { LEAD_IMPORT_FIELDS } from "@/components/shared/csv-import-fields";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useLeads, useClients, useUsers } from "@/lib/api/hooks";
import { useCreateLead, useConvertLead, useDeleteLead, useConvertLeadToDeal, useImportLeadsCsv } from "@/lib/api/mutations";
import { apiPatch, apiPost } from "@/lib/api/client";
import { toast } from "@/lib/hooks/use-toast";
import { formatCurrency, toArray } from "@/lib/utils";
import { createActionsColumn, type RowAction } from "@/components/ui/data-table-row-actions";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { ChartCard, DonutChart, TrendChart, CHART_COLORS } from "@/components/charts";
import type { ColumnDef } from "@tanstack/react-table";

interface LeadRow {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  source?: string;
  category?: string;
  status: string;
  estimatedValue?: number;
  notes?: string;
  nextFollowUpAt?: string;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
  metaLeadId?: string;
  assignedTo?: { id: string; firstName: string; lastName: string };
  assignedToId?: string;
  createdAt?: string;
}

const leadStatusTone: Record<string, "neutral" | "info" | "warning" | "positive" | "destructive"> = {
  NEW: "info", CONTACTED: "neutral", QUALIFIED: "warning", PROPOSAL_SENT: "warning",
  NEGOTIATION: "warning", WON: "positive", LOST: "destructive",
};

const CATEGORY_OPTIONS = [
  "General",
  "Meta Campaign",
  "Inbound",
  "Outbound",
  "Web Form",
  "Referral",
  "Event",
  "Enterprise",
  "SMB",
];

const schema = z.object({
  companyName: z.string().min(1, "Company name required"),
  contactName: z.string().min(1, "Contact name required"),
  email: z.union([z.literal(""), z.string().email("Enter a valid email")]).optional(),
  phone: z.string().optional(),
  source: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  estimatedValue: z.number().optional(),
  notes: z.string().optional(),
  nextFollowUpAt: z.date().optional(),
  campaignName: z.string().optional(),
  assignedToId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const dealSchema = z.object({
  name: z.string().min(1, "Deal name is required"),
  clientId: z.string().min(1, "Client is required"),
  amount: z.number().optional(),
  probability: z.number().optional(),
  expectedCloseDate: z.date().optional(),
  ownerId: z.string().optional(),
  description: z.string().optional(),
});
type DealFormValues = z.infer<typeof dealSchema>;

import { Users, Shuffle } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

interface StaffWorkloadItem {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  roles: string[];
  workload: { total: number; active: number; won: number; lost: number };
}

export default function LeadsPage() {
  const qc = useQueryClient();

  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [followUpFilter, setFollowUpFilter] = useState<string>("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");
  const [campaignFilter, setCampaignFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const queryParams: Record<string, string> = {};
  if (categoryFilter !== "ALL") queryParams.category = categoryFilter;
  if (statusFilter !== "ALL") queryParams.status = statusFilter;
  if (followUpFilter !== "ALL") queryParams.followUp = followUpFilter;
  if (assigneeFilter !== "ALL") queryParams.assignedToId = assigneeFilter;
  if (campaignFilter !== "ALL") queryParams.campaignName = campaignFilter;
  if (sortBy) {
    queryParams.sortBy = sortBy;
    queryParams.sortOrder = sortOrder;
  }

  const query = useLeads(queryParams);
  const clientsQuery = useClients();
  const usersQuery = useUsers();
  const { data: salesStaff = [] } = useQuery<Array<{ id: string; firstName: string; lastName: string; email: string }>>({
    queryKey: ["leads-sales-staff"],
    queryFn: () => apiFetch("/leads/sales-staff"),
  });

  const { data: dynamicCategories = CATEGORY_OPTIONS } = useQuery<string[]>({
    queryKey: ["leads-categories"],
    queryFn: () => apiFetch("/leads/categories"),
  });

  const { data: metaCampaigns = [] } = useQuery<Array<{ campaignName: string; leadCount: number }>>({
    queryKey: ["leads-meta-campaigns"],
    queryFn: () => apiFetch("/leads/meta-campaigns"),
  });

  const createMutation = useCreateLead();
  const convertMutation = useConvertLead();
  const deleteMutation = useDeleteLead();
  const importMutation = useImportLeadsCsv();
  const convertToDealMutation = useConvertLeadToDeal();

  const [editLead, setEditLead] = useState<LeadRow | null>(null);

  const updateLeadMutation = useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, any>) => apiPatch(`/leads/${id}`, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["leads-categories"] });
      void qc.invalidateQueries({ queryKey: ["leads-meta-campaigns"] });
      toast({ variant: "success", title: "Lead updated successfully" });
    },
    onError: () => toast({ variant: "error", title: "Failed to update lead" }),
  });

  const openEditModal = (lead: LeadRow) => {
    setEditLead(lead);
    form.reset({
      companyName: lead.companyName,
      contactName: lead.contactName,
      email: lead.email || "",
      phone: lead.phone || "",
      source: lead.source || "",
      category: lead.category || "General",
      status: lead.status || "NEW",
      estimatedValue: lead.estimatedValue ? Number(lead.estimatedValue) : undefined,
      notes: lead.notes || "",
      nextFollowUpAt: lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : undefined,
      campaignName: lead.campaignName || "",
      assignedToId: lead.assignedToId || "",
    });
    setCreateOpen(true);
  };

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch(`/leads/${id}`, { status }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["leads"] }); toast({ variant: "success", title: "Lead status updated" }); },
    onError: () => toast({ variant: "error", title: "Failed to update status" }),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [metaGuideOpen, setMetaGuideOpen] = useState(false);
  const [workloadOpen, setWorkloadOpen] = useState(false);

  const [staffWorkload, setStaffWorkload] = useState<{ staff: StaffWorkloadItem[]; unassignedCount: number } | null>(null);
  const [loadingWorkload, setLoadingWorkload] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<LeadRow | undefined>();
  const [detailLead, setDetailLead] = useState<LeadRow | undefined>();
  const [convertLead, setConvertLead] = useState<LeadRow | undefined>();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { category: "General", status: "NEW" } });
  const dealForm = useForm<DealFormValues>({ resolver: zodResolver(dealSchema) });

  const fetchWorkload = async () => {
    setLoadingWorkload(true);
    try {
      const res = await apiFetch<{ staff: StaffWorkloadItem[]; unassignedCount: number }>("/leads/staff-workload");
      setStaffWorkload(res);
    } catch {
      toast({ variant: "error", title: "Failed to load staff workload" });
    } finally {
      setLoadingWorkload(false);
    }
  };

  const openWorkloadModal = () => {
    setWorkloadOpen(true);
    void fetchWorkload();
  };

  const handleAutoDistribute = async (rebalanceAll = false) => {
    try {
      const res = await apiPost<{ success: boolean; count: number; staffCount: number }>("/leads/auto-distribute", { rebalanceAll });
      if (res.success) {
        toast({
          variant: "success",
          title: "Leads Equally Distributed!",
          description: `Equally divided ${res.count} leads across ${res.staffCount} active sales staff.`,
        });
        void qc.invalidateQueries({ queryKey: ["leads"] });
        void fetchWorkload();
      }
    } catch {
      toast({ variant: "error", title: "Lead distribution failed" });
    }
  };

  useEffect(() => {
    if (convertLead) {
      dealForm.reset({
        name: `${convertLead.companyName} — Deal`,
        clientId: "",
        amount: convertLead.estimatedValue,
        description: convertLead.notes ?? "",
      });
    }
  }, [convertLead, dealForm]);

  if (query.isLoading) return <LoadingState label="Loading leads..." />;
  if (query.isError || !query.data) return <ErrorState label="Unable to load leads." />;

  const leads = toArray<LeadRow>(query.data);
  const clients = toArray<{ id: string; companyName: string }>(clientsQuery.data);
  const users = salesStaff.length > 0
    ? salesStaff
    : toArray<{ id: string; firstName: string; lastName: string }>(usersQuery.data);

  const getFollowUpStatus = (dateStr?: string) => {
    if (!dateStr) return { label: "No Follow-up", tone: "neutral" as const, icon: Clock };
    const date = new Date(dateStr);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (date < startOfDay) {
      return { label: `Overdue (${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })})`, tone: "destructive" as const, icon: AlertTriangle };
    }
    if (date >= startOfDay && date <= endOfDay) {
      return { label: "Due Today", tone: "warning" as const, icon: Clock };
    }
    return { label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), tone: "info" as const, icon: Calendar };
  };

  const leadStatusDonut = (() => {
    const counts: Record<string, number> = {};
    leads.forEach((l) => { counts[l.status] = (counts[l.status] ?? 0) + 1; });
    const STATUS_COLOR: Record<string, string> = {
      NEW: CHART_COLORS.cyan, CONTACTED: CHART_COLORS.slate, QUALIFIED: CHART_COLORS.amber,
      PROPOSAL_SENT: CHART_COLORS.amber, NEGOTIATION: CHART_COLORS.violet,
      WON: CHART_COLORS.emerald, LOST: CHART_COLORS.red,
    };
    return Object.entries(counts).map(([label, value]) => ({
      label: label.replace("_", " "),
      value,
      color: STATUS_COLOR[label],
    }));
  })();

  const leadsTrend = (() => {
    const bucket: Record<string, number> = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      bucket[k] = 0;
    }
    leads.forEach((l) => {
      if (!l.createdAt) return;
      const d = new Date(l.createdAt);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (k in bucket) bucket[k]++;
    });
    return Object.entries(bucket).map(([k, v]) => {
      const [, m] = k.split("-");
      return { label: new Date(2000, Number(m) - 1, 1).toLocaleString("en-US", { month: "short" }), value: v };
    });
  })();

  const rowActions: RowAction<LeadRow>[] = [
    { label: "Edit Lead Details", icon: <Pencil className="size-4" />, onClick: (row) => openEditModal(row) },
    { label: "Contacted", onClick: (row) => updateStatusMutation.mutate({ id: row.id, status: "CONTACTED" }) },
    { label: "Qualified", onClick: (row) => updateStatusMutation.mutate({ id: row.id, status: "QUALIFIED" }) },
    { label: "Won", onClick: (row) => updateStatusMutation.mutate({ id: row.id, status: "WON" }) },
    { label: "Lost", onClick: (row) => updateStatusMutation.mutate({ id: row.id, status: "LOST" }), separator: true },
    {
      label: "Convert to Deal",
      icon: <TrendingUp className="size-4" />,
      onClick: (row) => { if (row.status !== "WON") setConvertLead(row); },
    },
    { label: "Convert to Client", icon: <UserPlus className="size-4" />, onClick: (row) => convertMutation.mutate(row.id) },
    { label: "Delete", icon: <Trash2 className="size-4" />, onClick: (row) => setDeleteTarget(row), destructive: true, separator: true },
  ];

  const columns: ColumnDef<LeadRow, unknown>[] = [
    { accessorKey: "companyName", header: "Company & Contact", cell: ({ row }) => (
      <div>
        <div className="font-medium text-slate-900 dark:text-slate-100">{row.original.companyName}</div>
        <div className="text-xs text-slate-500">{row.original.contactName}</div>
      </div>
    )},
    { accessorKey: "category", header: "Category", cell: ({ row }) => (
      <Badge tone={row.original.category === "Meta Campaign" ? "info" : "neutral"} size="sm">
        {row.original.category || "General"}
      </Badge>
    )},
    { accessorKey: "status", header: "Status", cell: ({ row }) => (
      <Badge tone={leadStatusTone[row.original.status] ?? "neutral"} size="sm" dot>
        {row.original.status.replace("_", " ")}
      </Badge>
    )},
    { accessorKey: "nextFollowUpAt", header: "Follow-up", cell: ({ row }) => {
      const fu = getFollowUpStatus(row.original.nextFollowUpAt);
      return <Badge tone={fu.tone} size="sm">{fu.label}</Badge>;
    }},
    { accessorKey: "estimatedValue", header: "Value", cell: ({ row }) => row.original.estimatedValue ? formatCurrency(Number(row.original.estimatedValue)) : "—" },
    { accessorKey: "source", header: "Source / Campaign", cell: ({ row }) => (
      <div>
        <div className="text-xs font-medium">{row.original.campaignName || row.original.source || "—"}</div>
        {row.original.source === "META_ADS" && <span className="text-[10px] text-blue-600 dark:text-blue-400">Meta Ad Lead</span>}
      </div>
    )},
    { accessorKey: "assignedTo", header: "Assignee", cell: ({ row }) => row.original.assignedTo ? `${row.original.assignedTo.firstName} ${row.original.assignedTo.lastName}` : "Unassigned" },
    createActionsColumn(rowActions),
  ];

  const onSubmit = (values: FormValues) => {
    const payload: any = {
      ...values,
      nextFollowUpAt: values.nextFollowUpAt ? values.nextFollowUpAt.toISOString() : undefined,
    };
    if (values.estimatedValue != null && !isNaN(values.estimatedValue)) {
      payload.estimatedValue = Number(values.estimatedValue);
    }

    if (editLead) {
      updateLeadMutation.mutate(
        { id: editLead.id, ...payload },
        {
          onSuccess: () => {
            setCreateOpen(false);
            setEditLead(null);
            form.reset();
          },
        },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          setCreateOpen(false);
          form.reset();
          void qc.invalidateQueries({ queryKey: ["leads"] });
          void qc.invalidateQueries({ queryKey: ["leads-categories"] });
          void qc.invalidateQueries({ queryKey: ["leads-meta-campaigns"] });
        },
      });
    }
  };

  const onSubmitDeal = (values: DealFormValues) => {
    if (!convertLead) return;
    const payload: Record<string, unknown> & { leadId: string } = {
      leadId: convertLead.id,
      name: values.name,
      clientId: values.clientId,
    };
    if (values.amount != null) payload.amount = values.amount;
    if (values.probability != null) payload.probability = values.probability;
    if (values.expectedCloseDate) payload.expectedCloseDate = values.expectedCloseDate.toISOString();
    if (values.ownerId) payload.ownerId = values.ownerId;
    if (values.description) payload.description = values.description;

    convertToDealMutation.mutate(payload, {
      onSuccess: () => { setConvertLead(undefined); dealForm.reset(); },
    });
  };

  const triggerTestMetaLead = async () => {
    try {
      const res = await apiPost<{ status: string; lead: any }>("/leads/meta-webhook", {
        contactName: "Sample Meta Lead",
        companyName: "Meta Ad Customer Inc.",
        email: "sample.lead@meta-ad.com",
        phone: "+91 98765 43210",
        campaignName: "Instagram Summer Promo 2026",
        adsetName: "Retargeting Audience",
        adName: "Carousel Ad #1",
        notes: "Captured via Meta Lead Ads Webhook",
      });
      if (res?.status === "SUCCESS") {
        toast({ variant: "success", title: "Meta Lead Ingested Successfully!", description: `Created lead for ${res.lead.contactName}` });
        void qc.invalidateQueries({ queryKey: ["leads"] });
      } else {
        toast({ variant: "info", title: "Meta Lead Check", description: "Lead already exists or verified." });
      }
    } catch {
      toast({ variant: "error", title: "Failed to send sample Meta lead" });
    }
  };

  const exportToCsv = () => {
    if (!leads.length) {
      toast({ variant: "info", title: "No leads to export" });
      return;
    }
    const headers = ["Company Name", "Contact Name", "Email", "Phone", "Category", "Status", "Estimated Value", "Source", "Campaign", "Follow-up Date", "Assigned To"];
    const rows = leads.map((l) => [
      `"${(l.companyName || "").replace(/"/g, '""')}"`,
      `"${(l.contactName || "").replace(/"/g, '""')}"`,
      `"${(l.email || "").replace(/"/g, '""')}"`,
      `"${(l.phone || "").replace(/"/g, '""')}"`,
      `"${(l.category || "General").replace(/"/g, '""')}"`,
      `"${(l.status || "").replace(/"/g, '""')}"`,
      `"${l.estimatedValue || ""}"`,
      `"${(l.source || "").replace(/"/g, '""')}"`,
      `"${(l.campaignName || "").replace(/"/g, '""')}"`,
      `"${l.nextFollowUpAt ? new Date(l.nextFollowUpAt).toISOString().split("T")[0] : ""}"`,
      `"${l.assignedTo ? `${l.assignedTo.firstName} ${l.assignedTo.lastName}` : "Unassigned"}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `nuro7_leads_export_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ variant: "success", title: "Leads exported to CSV!" });
  };

  return (
    <ListPageLayout module="clients" title="Lead Pipeline & CRM" description="Category-wise lead tracking, follow-up scheduling, and Meta Ads webhook integration."
      primaryAction={{ label: "New Lead", icon: <Plus className="mr-1 size-4" />, onClick: () => setCreateOpen(true) }}
      secondaryActions={[
        { label: "Staff Distribution", icon: <Users className="mr-1 size-4" />, onClick: openWorkloadModal },
        { label: "Meta Ads Integration", icon: <Share2 className="mr-1 size-4" />, onClick: () => setMetaGuideOpen(true) },
        { label: "Import CSV", icon: <Upload className="mr-1 size-4" />, onClick: () => setImportOpen(true) },
        { label: "Export CSV", icon: <Download className="mr-1 size-4" />, onClick: exportToCsv },
      ]}
      counts={[
        { label: "new", value: leads.filter((l) => l.status === "NEW").length, tone: "info" },
        { label: "won", value: leads.filter((l) => l.status === "WON").length, tone: "positive" },
        { label: "overdue follow-ups", value: leads.filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt) < new Date(new Date().setHours(0,0,0,0))).length, tone: "destructive" },
        { label: "total", value: leads.length },
      ]}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Leads by Status" description="Current pipeline distribution">
          <DonutChart data={leadStatusDonut} total={String(leads.length)} totalLabel="leads" height={220} />
        </ChartCard>
        <ChartCard title="Leads Over Time" description="Last 12 months">
          <TrendChart data={leadsTrend} color={CHART_COLORS.primary} type="area" height={220} />
        </ChartCard>
      </div>

      {/* Meta Campaign Filter Quick Tabs / Pills */}
      {metaCampaigns.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-blue-50/40 p-3 dark:border-blue-900/40 dark:bg-slate-900/60">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
            <Share2 className="size-4" /> Meta Campaigns:
          </div>
          <button
            type="button"
            onClick={() => setCampaignFilter("ALL")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
              campaignFilter === "ALL"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-700 hover:bg-blue-100 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            All Campaigns ({metaCampaigns.reduce((a, b) => a + b.leadCount, 0)})
          </button>
          {metaCampaigns.map((c) => (
            <button
              key={c.campaignName}
              type="button"
              onClick={() => setCampaignFilter(c.campaignName)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                campaignFilter === c.campaignName
                  ? "bg-blue-600 text-white shadow-sm font-semibold"
                  : "bg-white text-slate-700 hover:bg-blue-100 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              🎯 {c.campaignName} ({c.leadCount})
            </button>
          ))}
        </div>
      )}

      {/* Advanced Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
        <div className="font-semibold text-slate-700 dark:text-slate-300">Filters:</div>
        
        {/* Category Filter */}
        <div className="flex items-center gap-1.5">
          <Tag className="size-3.5 text-slate-400" />
          <span className="text-xs text-slate-500 font-medium">Category:</span>
          <Select
            size="sm"
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            options={[
              { value: "ALL", label: "All Categories" },
              ...dynamicCategories.map((c) => ({ value: c, label: c })),
            ]}
            className="w-36"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5 text-slate-400" />
          <span className="text-xs text-slate-500 font-medium">Status:</span>
          <Select
            size="sm"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={[
              { value: "ALL", label: "All Statuses" },
              { value: "NEW", label: "New" },
              { value: "CONTACTED", label: "Contacted" },
              { value: "QUALIFIED", label: "Qualified" },
              { value: "PROPOSAL_SENT", label: "Proposal Sent" },
              { value: "NEGOTIATION", label: "Negotiation" },
              { value: "WON", label: "Won" },
              { value: "LOST", label: "Lost" },
            ]}
            className="w-36"
          />
        </div>

        {/* Follow-up Filter */}
        <div className="flex items-center gap-1.5">
          <Calendar className="size-3.5 text-slate-400" />
          <span className="text-xs text-slate-500 font-medium">Follow-up:</span>
          <Select
            size="sm"
            value={followUpFilter}
            onValueChange={setFollowUpFilter}
            options={[
              { value: "ALL", label: "All Follow-ups" },
              { value: "OVERDUE", label: "🚨 Overdue" },
              { value: "TODAY", label: "⏰ Due Today" },
              { value: "UPCOMING", label: "📅 Scheduled" },
              { value: "NONE", label: "No Follow-up" },
            ]}
            className="w-36"
          />
        </div>

        {/* Assignee Filter */}
        <div className="flex items-center gap-1.5">
          <Users className="size-3.5 text-slate-400" />
          <span className="text-xs text-slate-500 font-medium">Assignee:</span>
          <Select
            size="sm"
            value={assigneeFilter}
            onValueChange={setAssigneeFilter}
            options={[
              { value: "ALL", label: "All Staff" },
              ...users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
            ]}
            className="w-36"
          />
        </div>

        {/* Meta Campaign Filter */}
        {metaCampaigns.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Share2 className="size-3.5 text-blue-500" />
            <span className="text-xs text-slate-500 font-medium">Meta Campaign:</span>
            <Select
              size="sm"
              value={campaignFilter}
              onValueChange={setCampaignFilter}
              options={[
                { value: "ALL", label: `All Meta Campaigns (${metaCampaigns.reduce((a, b) => a + b.leadCount, 0)})` },
                ...metaCampaigns.map((c) => ({ value: c.campaignName, label: `${c.campaignName} (${c.leadCount})` })),
              ]}
              className="w-44"
            />
          </div>
        )}

        {/* Sort By Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 font-medium">Sort By:</span>
          <Select
            size="sm"
            value={`${sortBy}_${sortOrder}`}
            onValueChange={(val) => {
              const [sb, so] = val.split("_");
              setSortBy(sb);
              setSortOrder(so as "asc" | "desc");
            }}
            options={[
              { value: "createdAt_desc", label: "Newest First" },
              { value: "createdAt_asc", label: "Oldest First" },
              { value: "campaignName_asc", label: "Meta Campaign (A-Z)" },
              { value: "campaignName_desc", label: "Meta Campaign (Z-A)" },
              { value: "companyName_asc", label: "Company (A-Z)" },
              { value: "estimatedValue_desc", label: "Highest Value" },
              { value: "nextFollowUpAt_asc", label: "Next Follow-up Date" },
            ]}
            className="w-40"
          />
        </div>

        {(categoryFilter !== "ALL" || statusFilter !== "ALL" || followUpFilter !== "ALL" || assigneeFilter !== "ALL" || campaignFilter !== "ALL" || sortBy !== "createdAt") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setCategoryFilter("ALL"); setStatusFilter("ALL"); setFollowUpFilter("ALL"); setAssigneeFilter("ALL"); setCampaignFilter("ALL"); setSortBy("createdAt"); setSortOrder("desc"); }}
            className="ml-auto text-xs text-slate-500 hover:text-slate-900"
          >
            Reset Filters
          </Button>
        )}
      </div>

      <DataTable columns={columns} data={leads} searchPlaceholder="Search by company, contact, email, phone, or campaign..."
        moduleColor="clients"
        onRowClick={(row) => setDetailLead(row)}
        emptyState={{ title: "No leads found", description: "Adjust your filters or add a new lead to populate your pipeline." }}
      />

      {/* Create / Edit Lead Modal */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setEditLead(null); }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{editLead ? "Edit Lead Details" : "Create New Lead"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Company Name" required error={form.formState.errors.companyName?.message}>
                <Input {...form.register("companyName")} error={!!form.formState.errors.companyName} placeholder="Acme Corp" />
              </FormField>
              <FormField label="Contact Name" required error={form.formState.errors.contactName?.message}>
                <Input {...form.register("contactName")} error={!!form.formState.errors.contactName} placeholder="John Doe" />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Email" error={form.formState.errors.email?.message}>
                <Input {...form.register("email")} error={!!form.formState.errors.email} type="email" placeholder="john@acme.com (optional)" />
              </FormField>
              <FormField label="Phone"><Input {...form.register("phone")} placeholder="+91 9876543210" /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Category">
                <div className="space-y-1.5">
                  <Select
                    value={dynamicCategories.includes(form.watch("category") || "") ? form.watch("category") : "CUSTOM"}
                    onValueChange={(v) => {
                      if (v !== "CUSTOM") form.setValue("category", v);
                      else form.setValue("category", "");
                    }}
                    options={[
                      ...dynamicCategories.map((c) => ({ value: c, label: c })),
                      { value: "CUSTOM", label: "➕ Create Custom Category..." },
                    ]}
                  />
                  {(!dynamicCategories.includes(form.watch("category") || "") || form.watch("category") === "") && (
                    <Input
                      placeholder="Type custom category name..."
                      value={form.watch("category") || ""}
                      onChange={(e) => form.setValue("category", e.target.value)}
                    />
                  )}
                </div>
              </FormField>
              <FormField label="Status">
                <Select
                  value={form.watch("status") || "NEW"}
                  onValueChange={(v) => form.setValue("status", v)}
                  options={[
                    { value: "NEW", label: "New" },
                    { value: "CONTACTED", label: "Contacted" },
                    { value: "QUALIFIED", label: "Qualified" },
                    { value: "PROPOSAL_SENT", label: "Proposal Sent" },
                    { value: "NEGOTIATION", label: "Negotiation" },
                    { value: "WON", label: "Won" },
                    { value: "LOST", label: "Lost" },
                  ]}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Next Follow-up Date">
                <DatePicker
                  value={form.watch("nextFollowUpAt")}
                  onChange={(d) => form.setValue("nextFollowUpAt", d ?? undefined)}
                />
              </FormField>
              <FormField label="Estimated Value">
                <NumberInput value={form.watch("estimatedValue")} onChange={(v) => form.setValue("estimatedValue", v ?? undefined)} prefix="INR" />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Source / Campaign">
                <Input {...form.register("source")} placeholder="Website, Referral, Meta Ads" />
              </FormField>
              <FormField label="Assign Lead To">
                <Select
                  value={form.watch("assignedToId") ?? ""}
                  onValueChange={(v) => form.setValue("assignedToId", v)}
                  placeholder="Select Sales Staff"
                  options={users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
                />
              </FormField>
            </div>
            <FormField label="Notes"><TextArea {...form.register("notes")} placeholder="Additional lead context, requirements..." /></FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => { setCreateOpen(false); setEditLead(null); }}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateLeadMutation.isPending}>
                {editLead
                  ? (updateLeadMutation.isPending ? "Saving..." : "Save Changes")
                  : (createMutation.isPending ? "Creating..." : "Create Lead")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Meta Lead Ads Integration Modal */}
      <Dialog open={metaGuideOpen} onOpenChange={setMetaGuideOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Share2 className="size-5" /> Meta (Facebook / Instagram) Lead Ads Integration
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed">
            <p className="text-slate-600 dark:text-slate-300">
              Connect your Facebook & Instagram Lead Ad campaigns directly to NURO CRM. Incoming leads from Meta ad forms are automatically ingested in real-time, categorized under <span className="font-semibold text-blue-600">Meta Campaign</span>, and assigned to your sales team with zero data loss.
            </p>
            
            <div className="rounded-lg border bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your Webhook URL (Meta App Setup)</div>
              <div className="mt-1 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                {typeof window !== "undefined" ? `${window.location.origin}/api/v1/leads/meta-webhook` : "/api/v1/leads/meta-webhook"}
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium text-slate-900 dark:text-slate-100">Integration Steps:</div>
              <ol className="list-inside list-decimal space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <li>Go to <span className="font-semibold">Meta App Dashboard &gt; Webhooks</span> and select <span className="font-semibold">Page / Leadgen</span>.</li>
                <li>Paste the Webhook URL above as your callback URL.</li>
                <li>Subscribe to <span className="font-semibold">leadgen</span> event triggers.</li>
                <li>Meta leads will instantly create new Lead records in your pipeline!</li>
              </ol>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
              <div className="text-xs font-semibold text-blue-800 dark:text-blue-300">Test Webhook Ingestion</div>
              <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-400">
                Click below to send a sample Meta lead payload to verify the CRM ingestion engine.
              </p>
              <Button size="sm" onClick={triggerTestMetaLead} className="mt-2.5 bg-blue-600 hover:bg-blue-700 text-white">
                Test Ingest Meta Sample Lead
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMetaGuideOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead detail drawer */}
      <Drawer
        open={!!detailLead}
        onOpenChange={(open) => { if (!open) setDetailLead(undefined); }}
        title={detailLead?.companyName ?? "Lead Details"}
        description={detailLead?.contactName}
        size="lg"
      >
        {detailLead && (
          <div className="space-y-5">
            {/* Quick Action Header Bar */}
            <div className="flex items-center justify-between rounded-lg border bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Lead Controls
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const target = detailLead;
                  setDetailLead(undefined);
                  openEditModal(target);
                }}
                className="h-8 gap-1.5 text-xs font-medium"
              >
                <Pencil className="size-3.5" /> Edit Lead Details
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">Category</div>
                <Select
                  size="sm"
                  value={detailLead.category || "General"}
                  onValueChange={(newCat) => {
                    updateLeadMutation.mutate({ id: detailLead.id, category: newCat });
                    setDetailLead({ ...detailLead, category: newCat });
                  }}
                  options={dynamicCategories.map((c) => ({ value: c, label: c }))}
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">Status</div>
                <Select
                  size="sm"
                  value={detailLead.status}
                  onValueChange={(newStatus) => {
                    updateLeadMutation.mutate({ id: detailLead.id, status: newStatus });
                    setDetailLead({ ...detailLead, status: newStatus });
                  }}
                  options={[
                    { value: "NEW", label: "New" },
                    { value: "CONTACTED", label: "Contacted" },
                    { value: "QUALIFIED", label: "Qualified" },
                    { value: "PROPOSAL_SENT", label: "Proposal Sent" },
                    { value: "NEGOTIATION", label: "Negotiation" },
                    { value: "WON", label: "Won" },
                    { value: "LOST", label: "Lost" },
                  ]}
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">Next Follow-up</div>
                <DatePicker
                  value={detailLead.nextFollowUpAt ? new Date(detailLead.nextFollowUpAt) : undefined}
                  onChange={(d) => {
                    const iso = d ? d.toISOString() : undefined;
                    updateLeadMutation.mutate({ id: detailLead.id, nextFollowUpAt: d });
                    setDetailLead({ ...detailLead, nextFollowUpAt: iso });
                  }}
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">Assigned Sales Staff</div>
                <Select
                  size="sm"
                  value={detailLead.assignedToId || ""}
                  onValueChange={(targetId) => {
                    updateLeadMutation.mutate({ id: detailLead.id, assignedToId: targetId });
                    const assigned = users.find((u) => u.id === targetId);
                    setDetailLead({ ...detailLead, assignedToId: targetId, assignedTo: assigned });
                  }}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
                  ]}
                />
              </div>

              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">Estimated Value</div>
                <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {detailLead.estimatedValue ? formatCurrency(Number(detailLead.estimatedValue)) : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">Email</div>
                <div className="mt-1 text-xs text-slate-700 dark:text-slate-300">{detailLead.email || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">Phone</div>
                <div className="mt-1 text-xs text-slate-700 dark:text-slate-300">{detailLead.phone ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">Source / Campaign</div>
                <div className="mt-1 text-xs text-slate-700 dark:text-slate-300">{detailLead.campaignName || detailLead.source || "—"}</div>
              </div>
            </div>

            {detailLead.notes && (
              <div>
                <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">Notes & Context</div>
                <p className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{detailLead.notes}</p>
              </div>
            )}

            <ActivityTimeline scope={{ leadId: detailLead.id }} />

            <div className="flex justify-end gap-3 border-t pt-4">
              {detailLead.status !== "WON" && (
                <Button onClick={() => { setConvertLead(detailLead); setDetailLead(undefined); }}>
                  <TrendingUp className="mr-2 size-4" /> Convert to Deal
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Convert to deal dialog */}
      <Dialog open={!!convertLead} onOpenChange={(open) => { if (!open) setConvertLead(undefined); }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Convert Lead to Deal</DialogTitle>
          </DialogHeader>
          <form onSubmit={dealForm.handleSubmit(onSubmitDeal)} className="space-y-4">
            <FormField label="Deal Name" required error={dealForm.formState.errors.name?.message}>
              <Input {...dealForm.register("name")} error={!!dealForm.formState.errors.name} />
            </FormField>
            <FormField label="Client" required error={dealForm.formState.errors.clientId?.message}>
              <Select
                value={dealForm.watch("clientId")}
                onValueChange={(v) => dealForm.setValue("clientId", v, { shouldValidate: true })}
                error={!!dealForm.formState.errors.clientId}
                placeholder="Select client"
                options={clients.map((c) => ({ value: c.id, label: c.companyName }))}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Amount">
                <NumberInput
                  value={dealForm.watch("amount") ?? null}
                  onChange={(v) => dealForm.setValue("amount", v ?? undefined)}
                  prefix="INR"
                />
              </FormField>
              <FormField label="Probability (%)">
                <NumberInput
                  value={dealForm.watch("probability") ?? null}
                  onChange={(v) => dealForm.setValue("probability", v ?? undefined)}
                  suffix="%"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Expected Close Date">
                <DatePicker
                  value={dealForm.watch("expectedCloseDate")}
                  onChange={(d) => dealForm.setValue("expectedCloseDate", d ?? undefined)}
                />
              </FormField>
              <FormField label="Owner">
                <Select
                  value={dealForm.watch("ownerId") ?? ""}
                  onValueChange={(v) => dealForm.setValue("ownerId", v)}
                  placeholder="Assign owner"
                  options={users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
                />
              </FormField>
            </div>
            <FormField label="Description">
              <TextArea {...dealForm.register("description")} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setConvertLead(undefined)}>Cancel</Button>
              <Button type="submit" disabled={convertToDealMutation.isPending}>
                {convertToDealMutation.isPending ? "Converting..." : "Convert"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        title="Delete lead" description={`Delete "${deleteTarget?.companyName}"?`} variant="destructive" confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(undefined) }); }}
        loading={deleteMutation.isPending} />

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityLabel="Leads"
        fields={LEAD_IMPORT_FIELDS}
        mutation={importMutation}
      />

      {/* Staff Lead Workload & Equal Auto-Distribution Dialog */}
      <Dialog open={workloadOpen} onOpenChange={setWorkloadOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5 text-indigo-600 dark:text-indigo-400" /> Staff Lead Workload & Auto-Distribution
            </DialogTitle>
          </DialogHeader>
          {loadingWorkload ? (
            <LoadingState label="Calculating staff workload..." />
          ) : (
            <div className="space-y-4 text-sm">
              <p className="text-slate-600 dark:text-slate-300">
                View current lead distribution across your sales team. Easily balance and equally divide unassigned or all leads using automated Round-Robin algorithm.
              </p>

              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <div className="text-xs text-slate-500 uppercase">Active Sales Staff</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{staffWorkload?.staff.length ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase">Unassigned Leads</div>
                  <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{staffWorkload?.unassignedCount ?? 0}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wider">Staff Workload Breakdown</div>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {staffWorkload?.staff.map((s) => {
                    const total = s.workload.total;
                    return (
                      <div key={s.id} className="flex items-center justify-between rounded-lg border p-3 bg-card dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs dark:bg-indigo-950 dark:text-indigo-300">
                            {s.name.split(" ").map((n) => n[0]).join("").toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-100">{s.name}</div>
                            <div className="text-xs text-slate-500">{s.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <Badge tone="info" size="sm">{s.workload.active} Active</Badge>
                          <Badge tone="positive" size="sm">{s.workload.won} Won</Badge>
                          <div className="font-bold text-slate-700 dark:text-slate-300 w-12 text-right">{total} Total</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/20 space-y-2">
                <div className="font-semibold text-indigo-900 dark:text-indigo-300 text-xs uppercase tracking-wider">Equal Distribution Actions</div>
                <p className="text-xs text-indigo-700 dark:text-indigo-400 leading-relaxed">
                  Click below to trigger automated round-robin distribution to divide leads equally across all active staff members.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={() => handleAutoDistribute(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Shuffle className="mr-1.5 size-3.5" /> Equally Divide Unassigned Leads ({staffWorkload?.unassignedCount ?? 0})
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => handleAutoDistribute(true)}>
                    <Users className="mr-1.5 size-3.5" /> Rebalance All Active Leads Equally
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setWorkloadOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageLayout>
  );
}

