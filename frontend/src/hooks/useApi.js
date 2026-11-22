import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../services/api";

/** GET a resource with loading / error state and a reload function. */
export function useApi(url, { initial = null, skip = false } = {}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError("");
    try {
      const r = await api.get(url);
      setData(r.data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => { if (!skip) load(); }, [load, skip]);
  return { data, setData, loading, error, reload: load };
}
