import { useCallback, useState } from "react";
import * as api from "../api/endpoints.js";

/* A second, fresher proof of identity for the two things a stale open tab
   must never be able to do: read a password back, and set a new one.

   The admin asks for a code, types it, and holds a grant for a few minutes —
   long enough to read one password and set another without being asked twice,
   short enough that walking away ends it. The grant lives in memory only; a
   reload starts again, deliberately. */
export function useStepUp() {
  const [grant, setGrant] = useState(null);       // { token, until }
  const [challenge, setChallenge] = useState(null); // the code is outstanding
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const ready = !!grant && grant.until > Date.now();

  const start = useCallback(async () => {
    setErr("");
    setBusy(true);
    try {
      setChallenge(await api.auth.stepUpStart());
      return { ok: true };
    } catch (e) {
      setErr(e.message);
      return { ok: false, error: e.message };
    } finally {
      setBusy(false);
    }
  }, []);

  const confirm = useCallback(async (code) => {
    setErr("");
    setBusy(true);
    try {
      const r = await api.auth.stepUpVerify({ challenge: challenge.challenge, code });
      setGrant({ token: r.grant, until: Date.now() + (r.expires_in - 5) * 1000 });
      setChallenge(null);
      return { ok: true };
    } catch (e) {
      setErr(e.message);
      return { ok: false, error: e.message };
    } finally {
      setBusy(false);
    }
  }, [challenge]);

  const resend = useCallback(async () => {
    setErr("");
    setBusy(true);
    try {
      setChallenge(await api.auth.resendOtp({ challenge: challenge.challenge }));
      return { ok: true };
    } catch (e) {
      setErr(e.message);
      return { ok: false, error: e.message };
    } finally {
      setBusy(false);
    }
  }, [challenge]);

  const reset = useCallback(() => { setChallenge(null); setErr(""); }, []);
  const forget = useCallback(() => { setGrant(null); setChallenge(null); setErr(""); }, []);

  return { grant: ready ? grant.token : null, ready, challenge, busy, err, setErr, start, confirm, resend, reset, forget };
}
