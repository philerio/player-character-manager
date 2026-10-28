import { useEffect, useState } from "react";
import { getSessionToken } from "../google-sheets-api";
import {
  diagnosticsScope,
  downloadDataIssues,
  getDataIssues,
  subscribeDataIssues,
} from "../app/dataDiagnostics";
export function DataDiagnostics({ characterId }: { characterId: string }) {
  const scope = diagnosticsScope(getSessionToken());
  const [issues, setIssues] = useState(() => getDataIssues(scope, characterId));
  useEffect(() => {
    const update = () => setIssues(getDataIssues(scope, characterId));
    update();
    return subscribeDataIssues(update);
  }, [scope, characterId]);
  return (
    <details className="data-diagnostics">
      <summary>
        Data checks
        {issues.length
          ? ` · ${issues.length} issue${issues.length === 1 ? "" : "s"}`
          : ""}
      </summary>
      {issues.length === 0 ? (
        <p>
          No active validation issues reported for this character. Checks cover
          data fetched by this app.
        </p>
      ) : (
        <>
          <p>
            Invalid responses were rejected. Use record IDs to locate campaign
            records; positions refer to the returned data.
          </p>
          <ol>
            {issues.map((issue) => (
              <li
                key={`${issue.action}:${issue.characterId}:${issue.path}:${issue.recordId}`}
              >
                <strong>{issue.collection || "Campaign response"}</strong>
                <dl>
                  <dt>Request</dt>
                  <dd>{issue.action}</dd>
                  {issue.characterId && (
                    <>
                      <dt>Character ID</dt>
                      <dd>{issue.characterId}</dd>
                    </>
                  )}
                  {issue.recordId && (
                    <>
                      <dt>Record ID</dt>
                      <dd>{issue.recordId}</dd>
                    </>
                  )}
                  {issue.recordIndex && (
                    <>
                      <dt>Response position</dt>
                      <dd>{issue.recordIndex}</dd>
                    </>
                  )}
                  <dt>Field</dt>
                  <dd>
                    <code>{issue.path}</code>
                  </dd>
                  <dt>Expected</dt>
                  <dd>{issue.expected}</dd>
                  <dt>Received</dt>
                  <dd>{issue.received}</dd>
                </dl>
              </li>
            ))}
          </ol>
          <p>
            Correct the record or campaign response, then use Refresh now.
            Checks stop at the first invalid field in each response.
          </p>
          <button
            className="secondary-action"
            type="button"
            onClick={() => downloadDataIssues(scope, characterId)}
          >
            Download data issue report
          </button>
        </>
      )}
    </details>
  );
}
