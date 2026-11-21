import './App.css';
import Login from './Login';
import MapView from './MapView';
import { useEffect, useState } from 'react';
import { API_BASE_URL } from './config/api';
import {
  LayoutDashboard,
  FileText,
  MapPin,
  Users,
  Settings,
  Search,
  Bell,
  Menu,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  MoreHorizontal,
  Filter,
  Plus,
} from 'lucide-react';

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import './App.css';

const navigation = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Map View', icon: MapPin },

];

function App() {
  const [auth, setAuth] = useState(null);
  const [activePage, setActivePage] = useState('Overview');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [showMoreAiInfo, setShowMoreAiInfo] = useState(false);
  const [adminPriority, setAdminPriority] = useState('medium');
  const [adminReason, setAdminReason] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [savingRejection, setSavingRejection] = useState(false);

  // Reports retrieved from the backend
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  

  const handleStatusChange = async (reportId, newStatus) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/reports/${reportId}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({
            submissionStatus: newStatus,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not update report status.');
      }

      // Update the dashboard table
      setReports((currentReports) =>
        currentReports.map((report) =>
          report.id === reportId ? result.report : report
        )
      );

      // Also update the currently displayed report
      setSelectedReport((currentReport) =>
        currentReport?.id === reportId ? result.report : currentReport
      );

    } catch (err) {
      console.error('Status update error:', err);
      alert(err.message || 'Unable to update report status.');
    }
  };


  const handleAdminDecision = async (decision) => {
    if (!selectedReport) return;

    try {
      setSavingDecision(true);

      const response = await fetch(
        `${API_BASE_URL}/api/reports/${selectedReport.id}/admin-decision`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({
            decision,
            priority: adminPriority,
            reason: adminReason,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not save administrator decision.');
      }

      setReports((currentReports) =>
        currentReports.map((report) =>
          report.id === selectedReport.id ? result.report : report
        )
      );

      setSelectedReport(result.report);
      setAdminReason('');
      setRejectionReason('');

      alert('Administrator decision saved successfully.');

    } catch (err) {
      console.error('Administrator decision error:', err);
      alert(err.message || 'Unable to save administrator decision.');
    } finally {
      setSavingDecision(false);
    }
  };

  const handleRejectReport = async () => {
    if (!selectedReport) return;

    if (rejectionReason.trim().length < 5) {
      alert('Please provide a rejection reason of at least 5 characters.');
      return;
    }

    try {
      setSavingRejection(true);

      const response = await fetch(
        `${API_BASE_URL}/api/reports/${selectedReport.id}/reject`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({
            reason: rejectionReason.trim(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not reject report.');
      }

      setReports((currentReports) =>
        currentReports.map((report) =>
          report.id === selectedReport.id ? result.report : report
        )
      );

      setSelectedReport(result.report);
      setRejectionReason('');

      alert('Report rejected successfully. The resident has been notified.');

    } catch (err) {
      console.error('Report rejection error:', err);
      alert(err.message || 'Unable to reject report.');
    } finally {
      setSavingRejection(false);
    }
  };


  // Retrieve reports from the CivicPulse backend
  useEffect(() => {
    const fetchReports = async () => {
      if (!auth?.token) return;

      try {
        const response = await fetch(
          '${API_BASE_URL}/api/admin/reports',
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${auth.token}`,
            },
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error('Could not retrieve reports.');
        }

        setReports(result.reports || []);
        setError('');
      } catch (err) {
        console.error('Dashboard report error:', err);
        setError(
          'Unable to load reports. Check that the backend is running.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [auth?.token]);

  // Search and filter actual reports
  const filteredReports = reports.filter((report) => {
    const matchesSearch = [
      report.id,
      report.category,
      report.description,
      report.location?.address,
    ]
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase());

    const status = (report.submissionStatus || 'received')
      .replaceAll('_', ' ')
      .toLowerCase();

    const matchesStatus =
      statusFilter === 'All' ||
      status === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });


  const rejectedReports = reports.filter(
    (report) => report.submissionStatus?.toLowerCase() === 'rejected'
  ).length;

  const rejectedPercentage = reports.length > 0
    ? ((rejectedReports / reports.length) * 100).toFixed(1)
    : '0.0';

  // Dashboard statistics from actual reports
  const stats = [
    {
      title: 'Total Reports',
      value: reports.length,
      icon: FileText,
      color: 'blue',
      note: 'All submitted reports',
    },
    {
      title: 'Pending Reports',
      value: reports.filter((r) =>
        ['received', 'under review'].includes(
          (r.submissionStatus || 'received')
            .replaceAll('_', ' ')
            .toLowerCase()
        )
      ).length,
      icon: Clock,
      color: 'orange',
      note: 'Awaiting attention',
    },
    
    {
      title: 'In Progress',
      value: reports.filter(
        (r) => (r.submissionStatus || '').toLowerCase() === 'in_progress'
      ).length,
      icon: AlertCircle,
      color: 'purple',
      note: 'Currently being handled',
    },

    {
      title: 'Resolved',
      value: reports.filter(
        (r) =>
          (r.submissionStatus || '').toLowerCase() === 'resolved'
      ).length,
      icon: CheckCircle2,
      color: 'green',
      note: 'Successfully completed',
    },

    {
      title: 'Rejected Reports',
      value: rejectedReports,
      icon: AlertCircle,
      color: 'orange',
      note: `${rejectedPercentage}% of all reports`,
    },

  ];
  // Reports grouped by submission status
  const statusChartData = [
    {
      name: 'Received',
      value: reports.filter(
        (r) => (r.submissionStatus || 'received').toLowerCase() === 'received'
      ).length,
    },
    {
      name: 'Under Review',
      value: reports.filter(
        (r) => (r.submissionStatus || '').toLowerCase() === 'under_review'
      ).length,
    },
    {
      name: 'In Progress',
      value: reports.filter(
        (r) => (r.submissionStatus || '').toLowerCase() === 'in_progress'
      ).length,
    },
    {
      name: 'Resolved',
      value: reports.filter(
        (r) => (r.submissionStatus || '').toLowerCase() === 'resolved'
      ).length,
    },

    {
      name: 'Rejected',
      value: reports.filter(
        (r) => (r.submissionStatus || '').toLowerCase() === 'rejected'
      ).length,
    },

  ];

  // Reports grouped by category
  const categoryChartData = Object.entries(
    reports.reduce((totals, report) => {
      const category = report.category || 'Other';
      totals[category] = (totals[category] || 0) + 1;
      return totals;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  // Reports submitted during the last six months
  const monthlyReportData = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));

    const year = date.getFullYear();
    const month = date.getMonth();

    const total = reports.filter((report) => {
      if (!report.createdAt) return false;

      const reportDate = new Date(report.createdAt);

      return (
        !Number.isNaN(reportDate.getTime()) &&
        reportDate.getFullYear() === year &&
        reportDate.getMonth() === month
      );
    }).length;

    return {
      month: date.toLocaleDateString('en-ZA', {
        month: 'short',
        year: 'numeric',
      }),
      reports: total,
    };
  });  


  // Colours used in the charts
  const chartColors = ['#269b72', '#e49a38', '#8962c9', '#4679d9'];

  if (!auth) {
    return <Login onLogin={setAuth} />;
  }
  return (
    <div className="app-layout">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-icon">CP</div>
          <div>
            <h2>CivicPulse</h2>
            <span>ADMINISTRATION</span>
          </div>
        </div>

        <div className="sidebar-label">MAIN MENU</div>

        <nav className="navigation">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.name}
                className={`nav-item ${
                  activePage === item.name ? 'active' : ''
                }`}
                onClick={() => {
                  setActivePage(item.name);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={19} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>


        <div className="sidebar-footer">
          <div className="admin-avatar">AD</div>
          <div>
            <strong>Administrator</strong>
            <span>Municipal Staff</span>
          </div>
          <button
            onClick={() => {
              setAuth(null);
              setReports([]);
              setSelectedReport(null);
            }}
            title="Sign out"
            className="logout-button"
          >
            Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main-content">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
          >
            <Menu size={22} />
          </button>

          <div className="breadcrumb">
            <span>Pages</span>
            <span>/</span>
            <strong>{activePage}</strong>
          </div>

          <div className="topbar-actions">
            <span className="date-label">Friday, 30 October 2026</span>
            <button className="icon-button" aria-label="Notifications">
              <Bell size={19} />
              <span className="notification-dot" />
            </button>
            <div className="topbar-avatar">AD</div>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-section">
            <div>
              <p className="eyebrow">MUNICIPAL MANAGEMENT</p>
              <h1>{activePage}</h1>
              <p className="welcome-description">
                Monitor and manage community service reports from one place.
              </p>
            </div>

            <button className="primary-button">
              <Plus size={18} />
              New Report
            </button>
          </section>
          {activePage === 'Map View' ? (
            <MapView reports={reports} />
          ) : (
            <>
          <section className="stats-grid">
            {stats.map((stat) => {
              const Icon = stat.icon;

              return (
                <article className="stat-card" key={stat.title}>
                  <div className="stat-top">
                    <div className={`stat-icon ${stat.color}`}>
                      <Icon size={21} />
                    </div>
                    <ArrowUpRight size={18} className="stat-arrow" />
                  </div>

                  <p>{stat.title}</p>
                  <h2>{stat.value}</h2>
                  <span>{stat.note}</span>
                </article>
              );
            })}
          </section>
          {/* Dashboard Analytics */}
          <section className="analytics-grid">

            {/* Reports by Status */}
            <div className="analytics-card">
              <div className="analytics-heading">
                <h2>Reports by Status</h2>
                <p>Distribution of municipal reports</p>
              </div>

              {reports.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell
                          key={`status-${index}`}
                          fill={chartColors[index]}
                        />
                      ))}
                    </Pie>

                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="chart-empty">No report data available yet.</p>
              )}
            </div>

            {/* Reports by Category */}
            <div className="analytics-card">
              <div className="analytics-heading">
                <h2>Reports by Category</h2>
                <p>Number of reports in each category</p>
              </div>

              {categoryChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={categoryChartData}
                    margin={{ top: 10, right: 15, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      interval={0}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />

                    <Bar
                      dataKey="value"
                      name="Reports"
                      fill="#269b72"
                      radius={[5, 5, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="chart-empty">No report data available yet.</p>
              )}
            </div>

          </section>

          {/* Monthly Reporting Trend */}
          <section className="analytics-card monthly-analytics">
            <div className="analytics-heading">
              <h2>Monthly Reporting Trend</h2>
              <p>Reports submitted over the last six months</p>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={monthlyReportData}
                margin={{ top: 15, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                />

                <Tooltip />

                <Line
                  type="monotone"
                  dataKey="reports"
                  name="Reports submitted"
                  stroke="#269b72"
                  strokeWidth={3}
                  dot={{ r: 5 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>



          <section className="reports-section">
            <div className="section-heading">
              <div>
                <h2>Recent Reports</h2>
                <p>Review and manage community submissions.</p>
              </div>

              <button className="secondary-button">
                View all reports <ArrowUpRight size={16} />
              </button>
            </div>

            <div className="table-toolbar">
              <div className="search-box">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search reports..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="filter-box">
                <Filter size={17} />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="All">All statuses</option>
                  <option value="Received">Received</option>
                  <option value="Under Review">Under Review</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>REPORT ID</th>
                    <th>CATEGORY</th>
                    <th>LOCATION</th>
                    <th>DATE SUBMITTED</th>
                    <th>PRIORITY</th>
                    <th>STATUS</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="7" className="empty-state">
                        Loading reports...
                      </td>
                    </tr>
                  )}

                  {!loading && error && (
                    <tr>
                      <td colSpan="7" className="empty-state">
                        {error}
                      </td>
                    </tr>
                  )}

                  {!loading && !error && filteredReports.map((report) => {
                    const status = (report.submissionStatus || 'received')
                      .replaceAll('_', ' ')
                      .replace(/\b\w/g, (char) => char.toUpperCase());

                    const priority =
                      report.adminDecision?.priority ||
                      report.analysis?.priority ||
                      'Not assessed';

                    return (
                      <tr
                        key={report.id}
                        className={
                          report.submissionStatus === 'rejected'
                            ? 'report-row-rejected'
                            : ''
                        }
                      >
                        <td className="report-id">{report.id}</td>

                        <td>
                          <strong>{report.category}</strong>
                          <span className="description">
                            {report.description}
                          </span>
                        </td>

                        <td>
                          <span className="location-cell">
                            <MapPin size={15} />
                            {report.location?.address || 'Not provided'}
                          </span>
                        </td>

                        <td>
                          {report.createdAt
                            ? new Date(report.createdAt).toLocaleDateString('en-ZA')
                            : 'Not available'}
                        </td>

                        <td>
                          <span className="priority">
                            {priority}
                          </span>
                        </td>
                        
                        <td>
                          <select
                            disabled={report.submissionStatus === 'rejected'}
                            value={report.submissionStatus || 'received'}
                            onChange={(e) =>
                              handleStatusChange(report.id, e.target.value)
                            }
                            className={`status status-${(report.submissionStatus || 'received').replaceAll('_', '-').toLowerCase()}`}
                          >
                            <option value="received">Received</option>
                            <option value="under_review">Under Review</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                          </select>
                        </td>
                        <td>
                          <button
                            className="view-details-btn"
                            onClick={() => {
                              setSelectedReport(report);
                              setShowMoreAiInfo(false);
                              setAdminPriority(
                                report.adminDecision?.priority ||
                                (['low', 'medium', 'high'].includes(
                                  report.analysis?.priority?.toLowerCase()
                                ) ? report.analysis.priority.toLowerCase() : 'medium')
                              );
                              setAdminReason('');
                            }}
                          >
                            View Details
                          </button>
                        </td>

                      </tr>
                    );
                  })}

                  {!loading && !error && filteredReports.length === 0 && (
                    <tr>
                      <td colSpan="7" className="empty-state">
                        No reports match your search.
                      </td>
                    </tr>
                  )}
                </tbody>

              </table>
            </div>

            <div className="table-footer">
              Showing {filteredReports.length} of {reports.length} reports
              <span>Updated just now</span>
            </div>
          </section>

          <footer className="dashboard-footer">
            <span>© 2026 CivicPulse. Municipal Reporting System.</span>
            <span>Administrator Portal</span>
          </footer>
          </>
        )}
        </div>
      </main>
      
      {selectedReport && (
        <div className="details-overlay">
          <div className="details-panel">

            <div className="details-header">
              <div>
                <h2>Report Details</h2>
                <p>Reference: {selectedReport.id}</p>
              </div>

              <button
                className="close-details"
                onClick={() => setSelectedReport(null)}
              >
                ×
              </button>
            </div>

            <div className="details-content">

              <div className="detail-item">
                <label>Category</label>
                <p>{selectedReport.category}</p>
              </div>

              <div className="detail-item">
                <label>Description</label>
                <p>{selectedReport.description}</p>
              </div>

              <div className="detail-item">
                <label>Location</label>
                <p>{selectedReport.location?.address || 'Not provided'}</p>
              </div>

              <div className="detail-item">
                <label>Latitude</label>
                <p>{selectedReport.location?.latitude ?? 'Not available'}</p>
              </div>

              <div className="detail-item">
                <label>Longitude</label>
                <p>{selectedReport.location?.longitude ?? 'Not available'}</p>
              </div>
              
              <div className="detail-item">
                <label>Reported Location Map</label>

                {selectedReport.location?.latitude != null &&
                selectedReport.location?.longitude != null ? (
                  <>
                    <iframe
                      title="Reported municipal issue location"
                      width="100%"
                      height="280"
                      style={{
                        border: 0,
                        borderRadius: '10px',
                        marginTop: '10px',
                      }}
                      loading="lazy"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(selectedReport.location.longitude) - 0.01}%2C${Number(selectedReport.location.latitude) - 0.01}%2C${Number(selectedReport.location.longitude) + 0.01}%2C${Number(selectedReport.location.latitude) + 0.01}&layer=mapnik&marker=${selectedReport.location.latitude}%2C${selectedReport.location.longitude}`}
                    />

                    <a
                      href={`https://www.openstreetmap.org/?mlat=${selectedReport.location.latitude}&mlon=${selectedReport.location.longitude}#map=16/${selectedReport.location.latitude}/${selectedReport.location.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="map-link"
                    >
                      Open full map
                    </a>
                  </>
                ) : (
                  <p>GPS coordinates are not available for this report.</p>
                )}
              </div>


              <div className="detail-item">
                <label>Date Submitted</label>
                <p>
                  {selectedReport.createdAt
                    ? new Date(selectedReport.createdAt).toLocaleString('en-ZA')
                    : 'Not available'}
                </p>
              </div>

              <div className="detail-item">
                <label>Priority</label>
                <p>
                  {selectedReport.adminDecision?.priority ||
                    selectedReport.analysis?.priority ||
                    'Not assessed'}
                </p>
              </div>

              
              {/* AI Assessment */}
              <section className="ai-assessment-section">
                <div className="ai-section-heading">
                  <h3>AI Assessment</h3>
                  <span className={`ai-status ai-status-${selectedReport.analysis?.status || 'pending'}`}>
                    {(selectedReport.analysis?.status || 'pending').toUpperCase()}
                  </span>
                </div>

                {selectedReport.analysis?.status === 'completed' &&
                selectedReport.analysis?.assessment ? (
                  (() => {
                    const assessment = selectedReport.analysis.assessment;

                    const renderList = (title, items) => (
                      <div className="ai-detail-block">
                        <h4>{title}</h4>
                        {Array.isArray(items) && items.length > 0 ? (
                          <ul>
                            {items.map((item, index) => (
                              <li key={`${title}-${index}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>None provided.</p>
                        )}
                      </div>
                    );

                    return (
                      <>
                        <div className="ai-summary-grid">
                          <div>
                            <span>Detected issue</span>
                            <strong>{assessment.detected_issue || 'Not identified'}</strong>
                          </div>

                          <div>
                            <span>Image relevance</span>
                            <strong>{assessment.image_relevance || 'Unknown'}</strong>
                          </div>

                          <div>
                            <span>Municipal issue</span>
                            <strong>
                              {assessment.is_municipal_issue === null
                                ? 'Uncertain'
                                : assessment.is_municipal_issue
                                  ? 'Yes'
                                  : 'No'}
                            </strong>
                          </div>

                          <div>
                            <span>Visual severity</span>
                            <strong>{assessment.visual_severity || 'Unknown'}</strong>
                          </div>

                          <div>
                            <span>Description severity</span>
                            <strong>{assessment.description_severity || 'Unknown'}</strong>
                          </div>

                          <div>
                            <span>Recommended priority</span>
                            <strong>{assessment.priority || 'Undetermined'}</strong>
                          </div>
                        </div>

                        <button
                          className="ai-more-info-btn"
                          onClick={() => setShowMoreAiInfo((current) => !current)}
                        >
                          {showMoreAiInfo ? 'Show less' : 'More information'}
                        </button>

                        {showMoreAiInfo && (
                          <>
                            {renderList('Visual observations', assessment.visual_observations)}
                        {renderList('Resident claims', assessment.resident_claims)}
                        {renderList('Unverified claims', assessment.unverified_claims)}
                        {renderList('Supporting evidence', assessment.evidence)}

                        <div className="ai-detail-block">
                          <h4>AI Explanation</h4>
                          <p>{assessment.reason || 'No explanation provided.'}</p>
                        </div>

                        <div className="ai-detail-block">
                          <h4>Recommended Action</h4>
                          <p>
                            {assessment.recommended_action || 'No action recommended.'}
                          </p>
                        </div>

                        <div className="ai-review-notice">
                          <strong>
                            {assessment.review_required
                              ? 'Human review required'
                              : 'Human review not flagged'}
                          </strong>
                          <p>
                            AI recommendations are advisory. The administrator
                            remains responsible for the final decision.
                          </p>
                        </div>

                        <div className="ai-model-info">
                          <span>Provider: {selectedReport.analysis.provider || 'Unknown'}</span>
                          <span>Model: {selectedReport.analysis.model || 'Unknown'}</span>
                          <span>
                            Assessed: {selectedReport.analysis.assessedAt
                              ? new Date(selectedReport.analysis.assessedAt).toLocaleString('en-ZA')
                              : 'Not available'}
                          </span>
                        </div>
                          </>
                        )}
                      </>
                    );
                  })()
                ) : (
                  <div className="ai-empty-state">
                    {selectedReport.analysis?.status === 'failed' ? (
                      <>
                        <strong>AI assessment failed</strong>
                        <p>
                          {selectedReport.analysis.error ||
                            'The AI service could not complete this assessment.'}
                        </p>
                      </>
                    ) : (
                      <>
                        <strong>AI assessment not available yet</strong>
                        <p>
                          Current analysis status: {selectedReport.analysis?.status || 'pending'}.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </section>

              {/* Administrator Final Decision */}
              <section className="admin-decision-section">
                <div className="ai-section-heading">
                  <h3>Administrator Review</h3>
                  <span className="ai-status ai-status-completed">
                    HUMAN DECISION
                  </span>
                </div>

                <div className="admin-final-result">
                  <span>Final municipal priority</span>
                  <strong>
                    {selectedReport.adminDecision?.priority
                      ? selectedReport.adminDecision.priority.toUpperCase()
                      : 'Awaiting administrator review'}
                  </strong>

                  {selectedReport.adminDecision?.decision && (
                    <p>
                      Decision: {selectedReport.adminDecision.decision === 'accepted'
                        ? 'AI recommendation accepted'
                        : 'AI recommendation overridden'}
                    </p>
                  )}

                  {selectedReport.adminDecision?.reason && (
                    <p>Reason: {selectedReport.adminDecision.reason}</p>
                  )}

                  {selectedReport.adminDecision?.reviewedAt && (
                    <p>
                      Reviewed: {new Date(
                        selectedReport.adminDecision.reviewedAt
                      ).toLocaleString('en-ZA')}
                    </p>
                  )}
                </div>

                {selectedReport.submissionStatus === 'rejected' && (
                  <div className="ai-empty-state">
                    <strong>Report locked</strong>
                    <p>
                      This report has been rejected. Administrator review and
                      priority changes are disabled.
                    </p>

                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => {
                        const confirmed = window.confirm(
                          'Are you sure you want to reactivate this report? Its status will return to Received.'
                        );

                        if (confirmed) {
                          handleStatusChange(selectedReport.id, 'received');
                        }
                      }}
                    >
                      Reactivate Report
                    </button>
                  </div>
                )}

                <div
                  className="admin-decision-controls"
                  style={{
                    opacity: selectedReport.submissionStatus === 'rejected' ? 0.5 : 1,
                    pointerEvents: selectedReport.submissionStatus === 'rejected'
                      ? 'none'
                      : 'auto',
                  }}
                >
                  <label htmlFor="admin-priority">Override priority</label>

                  <select
                    id="admin-priority"
                    value={adminPriority}
                    onChange={(e) => setAdminPriority(e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>

                  <label htmlFor="admin-reason">
                    Reason for overriding the AI recommendation
                  </label>

                  <textarea
                    id="admin-reason"
                    value={adminReason}
                    onChange={(e) => setAdminReason(e.target.value)}
                    placeholder="Explain why you selected a different priority..."
                    rows={3}
                  />

                  <button
                    className="admin-accept-button"
                    disabled={
                      savingDecision ||
                      !['low', 'medium', 'high'].includes(
                        selectedReport.analysis?.priority?.toLowerCase()
                      )
                    }
                    onClick={() => handleAdminDecision('accepted')}
                  >
                    {savingDecision ? 'Saving...' : 'Accept AI recommendation'}
                  </button>

                  <button
                    className="admin-override-button"
                    disabled={savingDecision || !adminReason.trim()}
                    onClick={() => handleAdminDecision('overridden')}
                  >
                    {savingDecision ? 'Saving...' : 'Save overridden priority'}
                  </button>
                </div>

                <p className="admin-decision-note">
                  The AI recommendation is advisory. The administrator makes and
                  records the final priority decision.
                </p>
              </section>

              {/* Administrator Report Rejection */}
              <section className="admin-decision-section">
                <div className="ai-section-heading">
                  <h3>Report Rejection</h3>
                  <span className="ai-status ai-status-failed">
                    ADMIN ACTION
                  </span>
                </div>

                {selectedReport.submissionStatus === 'rejected' ? (
                  <div className="ai-empty-state">
                    <strong>This report has been rejected.</strong>
                    <p>
                      Rejection reason: {selectedReport.rejectionReason || 'No reason recorded.'}
                    </p>
                    <p>
                      Rejected on: {selectedReport.rejectedAt
                        ? new Date(selectedReport.rejectedAt).toLocaleString('en-ZA')
                        : 'Not available'}
                    </p>
                  </div>
                ) : selectedReport.submissionStatus === 'resolved' ? (
                  <p>This report has already been resolved and cannot be rejected.</p>
                ) : (
                  <div className="admin-decision-controls">
                    <label htmlFor="rejection-reason">
                      Reason for rejecting this report
                    </label>

                    <textarea
                      id="rejection-reason"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Explain why this report cannot be accepted..."
                      rows={4}
                    />

                    <button
                      className="admin-override-button"
                      disabled={
                        savingRejection || rejectionReason.trim().length < 5
                      }
                      onClick={() => {
                        if (window.confirm(
                          'Are you sure you want to reject this report? The resident will be notified.'
                        )) {
                          handleRejectReport();
                        }
                      }}
                    >
                      {savingRejection ? 'Rejecting...' : 'Reject Report'}
                    </button>
                  </div>
                )}

                <p className="admin-decision-note">
                  Rejection details are retained in the system for administrative
                  accountability. The resident receives the rejection reason.
                </p>
              </section>

              <div className="detail-item">
                <label>Current Status</label>
                <p>
                  {(selectedReport.submissionStatus || 'received')
                    .replaceAll('_', ' ')
                    .replace(/\b\w/g, (char) => char.toUpperCase())}
                </p>
              </div>

              
              <div className="detail-item">
                <label>Submitted Photograph</label>

                {selectedReport.photo?.url || selectedReport.photoUri ? (
                  <img
                    src={
                      selectedReport.photo?.url
                        ? `${API_BASE_URL}${selectedReport.photo.url}`
                        : selectedReport.photoUri
                    }
                    alt="Submitted municipal report"
                    className="report-photo"
                    onClick={() => setShowPhotoPreview(true)}
                    title="Click to enlarge photograph"
                    onError={(event) => {
                      console.error(
                        'Could not load report photograph:',
                        event.currentTarget.src
                      );
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <p>No photograph available.</p>
                )}
              </div>


            </div>
          </div>
        </div>
      )}
      {showPhotoPreview && selectedReport && (
        <div
          className="photo-preview-overlay"
          onClick={() => setShowPhotoPreview(false)}
        >
          <button
            className="photo-preview-close"
            onClick={() => setShowPhotoPreview(false)}
            aria-label="Close photo preview"
          >
            ×
          </button>

          <img
            src={
              selectedReport.photo?.url
                ? `${API_BASE_URL}${selectedReport.photo.url}`
                : selectedReport.photoUri
            }
            alt="Enlarged municipal report photograph"
            className="photo-preview-image"
            onClick={(event) => event.stopPropagation()}
          />

          <p>Click outside the photograph to close</p>
        </div>
      )}
    </div>
  );
}

export default App;
