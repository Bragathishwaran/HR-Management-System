import { useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Download,
  FileArchive,
  FileCheck2,
  FileImage,
  FileText,
  FolderOpen,
  Paperclip,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { downloadFile, endpoints } from "../lib/api";
import { formatDate, formatDateTime, todayISO } from "../lib/format";
import type { DocumentRecord, DocumentType } from "../types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  StatCard,
} from "../components/UI";

const documentTypes: Array<{ value: DocumentType; label: string }> = [
  { value: "ID_PROOF", label: "ID proof" },
  { value: "CERTIFICATE", label: "Certificate" },
  { value: "CONTRACT", label: "Contract" },
  { value: "OTHER", label: "Other" },
];

function documentIcon(contentType: string) {
  if (contentType.startsWith("image/")) return FileImage;
  if (contentType.includes("pdf")) return FileText;
  if (contentType.includes("word") || contentType.includes("document"))
    return FileCheck2;
  return FileArchive;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function expiryState(expiry: string | null): "none" | "soon" | "expired" {
  if (!expiry) return "none";
  const today = todayISO();
  if (expiry < today) return "expired";
  const soon = new Date(`${today}T00:00:00`);
  soon.setDate(soon.getDate() + 30);
  return expiry <= soon.toISOString().slice(0, 10) ? "soon" : "none";
}

export function DocumentsPage() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canManage = hasRole("HR", "ADMIN");
  const fileInput = useRef<HTMLInputElement>(null);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | DocumentType>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadEmployee, setUploadEmployee] = useState("");
  const [uploadType, setUploadType] = useState<DocumentType>("ID_PROOF");
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);

  const resource = useResource(async () => {
    const [documents, employees] = await Promise.all([
      endpoints.documents({
        employee_id:
          canManage && employeeFilter !== "all"
            ? Number(employeeFilter)
            : undefined,
        document_type: typeFilter === "all" ? undefined : typeFilter,
        limit: 200,
      }),
      canManage ? endpoints.employees({ limit: 100 }) : Promise.resolve([]),
    ]);
    return { documents, employees };
  }, [employeeFilter, typeFilter, canManage]);

  const documents = resource.data?.documents || [];
  const employees = resource.data?.employees || [];

  const stats = useMemo(() => {
    const expiring = documents.filter(
      (document) => expiryState(document.expiry_date) === "soon",
    ).length;
    const expired = documents.filter(
      (document) => expiryState(document.expiry_date) === "expired",
    ).length;
    const totalBytes = documents.reduce(
      (sum, document) => sum + document.file_size,
      0,
    );
    return { expiring, expired, totalBytes };
  }, [documents]);

  const openUpload = () => {
    setUploadEmployee(employeeFilter === "all" ? "" : employeeFilter);
    setUploadType("ID_PROOF");
    setUploadExpiry("");
    setSelectedFile(null);
    if (fileInput.current) fileInput.current.value = "";
    setUploadOpen(true);
  };

  const submitUpload = async () => {
    if (!selectedFile) {
      toast.error("Choose a file", "Select a PDF, image or Word document to upload.");
      return;
    }
    if (canManage && !uploadEmployee) {
      toast.error("Choose an employee", "HR uploads must be linked to a profile.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("document_type", uploadType);
    if (uploadExpiry) formData.append("expiry_date", uploadExpiry);
    if (canManage) formData.append("employee_id", uploadEmployee);

    setUploading(true);
    try {
      await endpoints.uploadDocument(formData);
      toast.success(
        "Document uploaded",
        `${selectedFile.name} is now securely stored.`,
      );
      setUploadOpen(false);
      resource.refresh();
    } catch (error) {
      toast.error("Upload failed", (error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const download = async (document: DocumentRecord) => {
    setDownloading(document.id);
    try {
      await downloadFile(
        `/documents/${document.id}/download`,
        document.file_name,
      );
    } catch (error) {
      toast.error("Download failed", (error as Error).message);
    } finally {
      setDownloading(null);
    }
  };

  const remove = async (document: DocumentRecord) => {
    try {
      await endpoints.deleteDocument(document.id);
      toast.success("Document deleted", `${document.file_name} was removed.`);
      resource.refresh();
    } catch (error) {
      toast.error("Delete failed", (error as Error).message);
    }
  };

  if (resource.loading && !resource.data) {
    return <LoadingState label="Opening the document vault…" />;
  }
  if (resource.error) {
    return <ErrorState message={resource.error} onRetry={resource.refresh} />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Secure records"
        title="Documents"
        description="Store contracts, IDs and certificates with controlled, authenticated access."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw size={16} />}
              onClick={resource.refresh}
              loading={resource.loading}
            >
              Refresh
            </Button>
            <Button icon={<Upload size={16} />} onClick={openUpload}>
              Upload document
            </Button>
          </>
        }
      />

      <section className="stats-grid">
        <StatCard
          label="Documents"
          value={documents.length}
          meta={canManage ? "Across all employees" : "In your vault"}
          icon={FolderOpen}
          tone="green"
        />
        <StatCard
          label="Expiring soon"
          value={stats.expiring}
          meta="Within 30 days"
          icon={CalendarClock}
          tone="amber"
        />
        <StatCard
          label="Expired"
          value={stats.expired}
          meta="Needs a renewal"
          icon={FileArchive}
          tone="rose"
        />
        <StatCard
          label="Storage used"
          value={formatBytes(stats.totalBytes)}
          meta="Secure server storage"
          icon={ShieldCheck}
          tone="teal"
        />
      </section>

      <section className="card table-card">
        <div className="table-toolbar table-toolbar-wrap">
          <div className="toolbar-left">
            {canManage && (
              <Select
                value={employeeFilter}
                onChange={(event) => setEmployeeFilter(event.target.value)}
                aria-label="Filter by employee"
                className="toolbar-select"
              >
                <option value="all">All employees</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name}
                  </option>
                ))}
              </Select>
            )}
            <Select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as "all" | DocumentType)
              }
              aria-label="Filter by document type"
              className="toolbar-select"
            >
              <option value="all">All types</option>
              {documentTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
            {(employeeFilter !== "all" || typeFilter !== "all") && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setEmployeeFilter("all");
                  setTypeFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          <span className="table-count">{documents.length} files</span>
        </div>

        {documents.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No documents yet"
            description="Upload an ID, contract or certificate to keep it safe and easy to find."
            action={
              <Button size="sm" icon={<Upload size={15} />} onClick={openUpload}>
                Upload document
              </Button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  {canManage && <th>Employee</th>}
                  <th>Type</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Expiry</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => {
                  const Icon = documentIcon(document.content_type);
                  const expiry = expiryState(document.expiry_date);
                  return (
                    <tr key={document.id}>
                      <td>
                        <div className="document-cell">
                          <span className="document-icon">
                            <Icon size={17} />
                          </span>
                          <div>
                            <span className="person-name">{document.file_name}</span>
                            <span className="person-sub">
                              {document.content_type}
                              {document.uploaded_by
                                ? ` · uploaded by ${document.uploaded_by}`
                                : ""}
                            </span>
                          </div>
                        </div>
                      </td>
                      {canManage && (
                        <td>
                          <span className="cell-strong">
                            {document.employee_name || `Employee #${document.employee_id}`}
                          </span>
                        </td>
                      )}
                      <td>
                        <Badge tone="blue">
                          {documentTypes.find((type) => type.value === document.document_type)
                            ?.label || document.document_type}
                        </Badge>
                      </td>
                      <td>{formatBytes(document.file_size)}</td>
                      <td>{formatDateTime(document.uploaded_at)}</td>
                      <td>
                        {!document.expiry_date ? (
                          <span className="muted">No expiry</span>
                        ) : expiry === "expired" ? (
                          <span className="expiry-mark is-expired">
                            Expired {formatDate(document.expiry_date)}
                          </span>
                        ) : expiry === "soon" ? (
                          <span className="expiry-mark is-soon">
                            {formatDate(document.expiry_date)}
                          </span>
                        ) : (
                          <span>{formatDate(document.expiry_date)}</span>
                        )}
                      </td>
                      <td className="cell-actions">
                        <button
                          type="button"
                          className="table-action"
                          title={`Download ${document.file_name}`}
                          aria-label={`Download ${document.file_name}`}
                          onClick={() => download(document)}
                          disabled={downloading === document.id}
                        >
                          <Download size={16} />
                        </button>
                        {canManage && (
                          <IconButton
                            label={`Delete ${document.file_name}`}
                            onClick={() => remove(document)}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="insight-strip">
        <span className="icon-tile icon-tile-teal">
          <ShieldCheck size={18} />
        </span>
        <p>
          <strong>Your files are private.</strong> Downloads require an authenticated
          session, employee uploads are restricted to their own profile, and HR/Admin
          access is role-checked on every request.
        </p>
      </section>

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload a document"
        description="PDF, PNG, JPG and Word files up to 10 MB. Contents are validated before storage."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setUploadOpen(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button onClick={submitUpload} loading={uploading}>
              Upload
            </Button>
          </>
        }
      >
        <div className="form-grid">
          {canManage && (
            <Field label="Employee" htmlFor="document-employee" required>
              <Select
                id="document-employee"
                value={uploadEmployee}
                onChange={(event) => setUploadEmployee(event.target.value)}
              >
                <option value="">Select an employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name} · {employee.department}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Document type" htmlFor="document-type">
            <Select
              id="document-type"
              value={uploadType}
              onChange={(event) => setUploadType(event.target.value as DocumentType)}
            >
              {documentTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Expiry date" htmlFor="document-expiry" hint="Optional. Used for renewal reminders.">
            <Input
              id="document-expiry"
              type="date"
              value={uploadExpiry}
              onChange={(event) => setUploadExpiry(event.target.value)}
            />
          </Field>
          <Field label="File" htmlFor="document-file" required>
            <label className="file-picker" htmlFor="document-file">
              <Paperclip size={16} />
              <span>{selectedFile ? selectedFile.name : "Choose a PDF, image or Word file"}</span>
              <input
                ref={fileInput}
                id="document-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
            </label>
            {selectedFile && (
              <span className="field-hint">{formatBytes(selectedFile.size)}</span>
            )}
          </Field>
        </div>
      </Modal>
    </div>
  );
}
