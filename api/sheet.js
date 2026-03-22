const https = require("https");
const SOURCES = {
  "live-scoring": "https://docs.google.com/spreadsheets/d/e/2PACX-1vSe6mW01Q2kgWDNkm-WDUtJziEmKHcpvvP-TKHy84jTjTXE_qIjEQZPDDPb36Xqn5k8t5-kpB6ipq1N/pub?gid=712264809&single=true&output=csv",
  "schedule": "https://docs.google.com/spreadsheets/d/e/2PACX-1vSe6mW01Q2kgWDNkm-WDUtJziEmKHcpvvP-TKHy84jTjTXE_qIjEQZPDDPb36Xqn5k8t5-kpB6ipq1N/pub?gid=0&single=true&output=csv",
};
module.exports = (req, res) => {
  const source = req.query && req.query.name ? String(req.query.name) : "";
  const url = SOURCES[source];
  if (!url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, message: "Invalid sheet name" }));
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  https.get(url, (googleRes) => {
    // Follow redirect if needed
    if (googleRes.statusCode === 301 || googleRes.statusCode === 302) {
      https.get(googleRes.headers.location, (redirectRes) => {
        redirectRes.pipe(res);
      });
      return;
    }
    googleRes.pipe(res);
  }).on("error", (err) => {
    res.statusCode = 500;
    res.end("Error fetching sheet: " + err.message);
  });
};