import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { api, friendlyError, supabase } from "./lib";
import { isLocalMockMode } from "./mock-api";

export type AccountSummary = {
  userId: string;
  name: string;
  email: string;
  photoUrl: string | null;
};

export function AccountView({ onChanged }: { onChanged: (account: AccountSummary) => void }) {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [mockMode] = useState(isLocalMockMode);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [securityNotice, setSecurityNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = mockMode
      ? api<{ data: AccountSummary }>("/api/account").then((response) => response.data)
      : supabase.auth.getUser().then(async ({ data, error: authError }) => {
        if (authError || !data.user) throw authError ?? new Error("session_expired");
        const path = typeof data.user.user_metadata?.avatar_path === "string" ? data.user.user_metadata.avatar_path : null;
        let signedUrl: string | null = null;
        if (path) {
          const { data: signed } = await supabase.storage.from("profile-photos").createSignedUrl(path, 3600);
          signedUrl = signed?.signedUrl ?? null;
        }
        return {
          userId: data.user.id,
          name: String(data.user.user_metadata?.display_name ?? data.user.user_metadata?.name ?? ""),
          email: data.user.email ?? "",
          photoUrl: signedUrl,
          photoPath: path
        };
      });
    void load
      .then((loaded) => {
        const summary: AccountSummary = { userId: loaded.userId, name: loaded.name, email: loaded.email, photoUrl: loaded.photoUrl };
        setAccount(summary);
        setName(summary.name);
        setEmail(summary.email);
        setPhotoUrl(summary.photoUrl);
        setPhotoPath("photoPath" in loaded && typeof loaded.photoPath === "string" ? loaded.photoPath : null);
        onChanged(summary);
      })
      .catch((nextError) => setError(friendlyError(nextError)));
  }, [mockMode, onChanged]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setError(""); setProfileNotice("");
    try {
      if (mockMode) {
        const response = await api<{ data: AccountSummary }>("/api/account", {
          method: "PATCH", body: JSON.stringify({ name, email, photoUrl })
        });
        setAccount(response.data);
        onChanged(response.data);
        setProfileNotice("Dados da conta atualizados.");
        return;
      }
      const { data: current, error: authError } = await supabase.auth.getUser();
      if (authError || !current.user) throw authError ?? new Error("session_expired");
      let nextPhotoPath = photoPath;
      if (photoFile) {
        const extension = photoFile.type === "image/png" ? "png" : photoFile.type === "image/webp" ? "webp" : "jpg";
        nextPhotoPath = `${current.user.id}/avatar.${extension}`;
        const { error: uploadError } = await supabase.storage.from("profile-photos").upload(nextPhotoPath, photoFile, {
          contentType: photoFile.type, upsert: true, cacheControl: "3600"
        });
        if (uploadError) throw uploadError;
      } else if (photoUrl === null && photoPath) {
        const { error: removeError } = await supabase.storage.from("profile-photos").remove([photoPath]);
        if (removeError) throw removeError;
        nextPhotoPath = null;
      }
      const { data: updated, error: updateError } = await supabase.auth.updateUser({
        data: { display_name: name.trim(), avatar_path: nextPhotoPath }
      });
      if (updateError || !updated.user) throw updateError ?? new Error("account_update_failed");
      if (email.trim().toLowerCase() !== current.user.email?.toLowerCase()) {
        const { error: emailError } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
        if (emailError) throw emailError;
        setProfileNotice("Nome e foto salvos. Enviamos uma confirmação para o novo e-mail; a alteração entra em vigor após a confirmação.");
      } else {
        setProfileNotice("Dados da conta atualizados.");
      }
      const signed = nextPhotoPath
        ? await supabase.storage.from("profile-photos").createSignedUrl(nextPhotoPath, 3600)
        : { data: null };
      const summary: AccountSummary = {
        userId: updated.user.id,
        name: String(updated.user.user_metadata?.display_name ?? name.trim()),
        email: updated.user.email ?? current.user.email ?? "",
        photoUrl: signed.data?.signedUrl ?? null
      };
      setAccount(summary);
      setEmail(summary.email);
      setPhotoPath(nextPhotoPath);
      setPhotoFile(null);
      setPhotoUrl(summary.photoUrl);
      onChanged(summary);
    } catch (nextError) { setError(friendlyError(nextError)); }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault(); setError(""); setSecurityNotice("");
    if (password !== confirmation) { setError("A confirmação precisa ser igual à nova senha."); return; }
    try {
      if (mockMode) {
        await api("/api/account/password", { method: "POST", body: JSON.stringify({ currentPassword, password }) });
      } else {
        const { data: current, error: userError } = await supabase.auth.getUser();
        if (userError || !current.user?.email) throw userError ?? new Error("session_expired");
        const { error: reauthError } = await supabase.auth.signInWithPassword({ email: current.user.email, password: currentPassword });
        if (reauthError) throw new Error("invalid_current_password");
        const { error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) throw passwordError;
      }
      setCurrentPassword(""); setPassword(""); setConfirmation("");
      setSecurityNotice("Senha atualizada.");
    } catch (nextError) { setError(friendlyError(nextError)); }
  }

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpeg|webp)$/) || file.size > 2_000_000) {
      setError("Use uma imagem PNG, JPG ou WebP de até 2 MB.");
      return;
    }
    const reader = new FileReader();
    setPhotoFile(file);
    reader.onload = () => { if (typeof reader.result === "string") setPhotoUrl(reader.result); };
    reader.readAsDataURL(file);
  }

  const initial = (name || email || "U").slice(0, 1).toUpperCase();

  return (
    <div className="page account-page">
      <section className="page-title account-title">
        <div><p className="eyebrow">Identidade e acesso</p><h1>Minha conta</h1></div>
        <p>Atualize como você aparece no Maxio Hub e mantenha seus dados de acesso sob controle.</p>
      </section>
      {error && <div className="notice error" role="alert"><span>{error}</span></div>}
      <div className="account-grid">
        <form className="account-card profile-card" onSubmit={saveProfile}>
          <header><div><p className="eyebrow">Perfil</p><h2>Dados pessoais</h2></div><span className="account-id">{account?.userId.slice(0, 8) ?? "carregando"}</span></header>
          <div className="photo-control">
            <span className="profile-photo">{photoUrl ? <img src={photoUrl} alt="Foto da conta" /> : initial}</span>
            <div><strong>Foto de perfil</strong><p>PNG, JPG ou WebP de até 2 MB.</p><label className="button secondary compact file-button">Escolher foto<input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectPhoto} /></label>{photoUrl && <button type="button" className="text-action danger" onClick={() => { setPhotoUrl(null); setPhotoFile(null); }}>Remover</button>}</div>
          </div>
          <div className="account-fields">
            <label className="field"><span>Nome</span><input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
            <label className="field"><span>E-mail</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /><small>Uma alteração real exigirá confirmação no novo endereço.</small></label>
          </div>
          {profileNotice && <div className="notice success" role="status"><span>{profileNotice}</span></div>}
          <footer><button className="button primary">Salvar dados pessoais</button></footer>
        </form>

        <form className="account-card security-card" onSubmit={savePassword}>
          <header><div><p className="eyebrow">Segurança</p><h2>Alterar senha</h2></div><span className="security-mark" aria-hidden="true" /></header>
          <p className="account-card-copy">Use pelo menos 12 caracteres. A alteração exige a senha atual e uma nova autenticação.</p>
          <label className="field"><span>Senha atual</span><input required type="password" minLength={8} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label>
          <label className="field"><span>Nova senha</span><input required type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
          <label className="field"><span>Confirmar nova senha</span><input required type="password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" /></label>
          {securityNotice && <div className="notice success" role="status"><span>{securityNotice}</span></div>}
          <footer><button className="button secondary">Atualizar senha</button></footer>
        </form>
      </div>
    </div>
  );
}
