const https = require("https");
const SOURCES = {
  "live-scoring":"https://docs.google.com/spreadsheets/d/e/2PACX-1vSe6mW01Q2kgWDNkm-WDUtJziEmKHcpvvP-TKHy84jTjTXE_qIjEQZPDDPb36Xqn5k8t5-kpB6ipq1N/pub?gid=712264809&single=true&output=csv",
  "schedule":"https://docs.google.com/spreadsheets/d/e/2PACX-1vSe6mW01Q2kgWDNkm-WDUtJziEmKHcpvvP-TKHy84jTjTXE_qIjEQZPDDPb36Xqn5k8t5-kpB6ipq1N/pub?gid=1186488561&single=true&output=csv",
 "roster":"https://docs.google.com/spreadsheets/d/e/2PACX-1vSe6mW01Q2kgWDNkm-WDUtJziEmKHcpvvP-TKHy84jTjTXE_qIjEQZPDDPb36Xqn5k8t5-kpB6ipq1N/pub?gid=0&single=true&output=csv",

};
function fetchWithRedirects(url, res, redirectCount) {
  if (redirectCount > 5) {
    res.statusCode = 500;
    res.end("Too many redirects");
    return;
  }
  https.get(url, (googleRes) => {
    const status = googleRes.statusCode;
    if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
      const location = googleRes.headers.location;
      googleRes.resume(); // drain the response
      fetchWithRedirects(location, res, redirectCount + 1);
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    googleRes.pipe(res);
  }).on("error", (err) => {
    res.statusCode = 500;
    res.end("Error: " + err.message);
  });
}
module.exports = (req, res) => {
  const source = req.query && req.query.name ? String(req.query.name) : "";
  const url = SOURCES[source];
  if (!url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, message: "Invalid sheet name" }));
    return;
  }
  fetchWithRedirects(url, res, 0);
};
