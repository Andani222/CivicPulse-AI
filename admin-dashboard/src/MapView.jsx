
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet';

import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

const getMarkerColour = (status) => {
  const normalisedStatus = (status || 'received')
    .replaceAll('_', ' ')
    .toLowerCase();

  if (normalisedStatus === 'resolved') {
    return '#16a34a'; // Green
  }

  if (normalisedStatus === 'in progress') {
    return '#f59e0b'; // Orange
  }

  return '#dc2626'; // Red
};

// Automatically adjusts the map to display all reports
function FitReportsBounds({ reports }) {
  const map = useMap();

  useEffect(() => {
    const validReports = reports.filter(
      (report) =>
        Number.isFinite(Number(report.location?.latitude)) &&
        Number.isFinite(Number(report.location?.longitude)) &&
        report.location?.latitude != null &&
        report.location?.longitude != null
    );

    if (validReports.length > 0) {
      const bounds = validReports.map((report) => [
        Number(report.location.latitude),
        Number(report.location.longitude),
      ]);

      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [reports, map]);

  return null;
}

function MapView({ reports }) {
  const validReports = reports.filter(
    (report) =>
      Number.isFinite(Number(report.location?.latitude)) &&
      Number.isFinite(Number(report.location?.longitude)) &&
      report.location?.latitude != null &&
      report.location?.longitude != null
  );

  return (
    <div className="admin-map-container">
      <div className="map-legend">
        <span><i className="legend-dot red"></i> Received / Under Review</span>
        <span><i className="legend-dot orange"></i> In Progress</span>
        <span><i className="legend-dot green"></i> Resolved</span>
      </div>

      <MapContainer
        center={[-29, 24]}
        zoom={5}
        scrollWheelZoom={true}
        className="admin-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitReportsBounds reports={validReports} />

        {validReports.map((report) => {
          const colour = getMarkerColour(report.submissionStatus);

          return (
            <CircleMarker
              key={report.id}
              center={[
                Number(report.location.latitude),
                Number(report.location.longitude),
              ]}
              radius={9}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: colour,
                fillOpacity: 1,
              }}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{report.category}</strong>
                  <p>{report.description}</p>
                  <p>
                    <b>Status:</b>{' '}
                    {(report.submissionStatus || 'received')
                      .replaceAll('_', ' ')
                      .replace(/\b\w/g, (char) => char.toUpperCase())}
                  </p>
                  <p>
                    <b>Location:</b>{' '}
                    {report.location?.address || 'Not provided'}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <p className="map-report-count">
        Displaying {validReports.length} of {reports.length} reports with GPS coordinates
      </p>
    </div>
  );
}

export default MapView;
