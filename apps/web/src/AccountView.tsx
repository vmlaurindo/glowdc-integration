import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { api, friendlyError } from "./lib";

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
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [securityNotice, setSecurityNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void api<{ data: AccountSummary }>("/api/account")
      .then((response) => {
        setAccount(response.data);
        setName(response.data.name);
        setEmail(response.data.email);
        setPhotoUrl(response.data.photoUrl);
        onChanged(response.data);
      })
      .catch((nextError) => setError(friendlyError(nextError)));
  }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setError(""); setProfileNotice("");
    try {
      const response = await api<{ data: AccountSummary }>("/api/account", {
        method: "PATCH",
        body: JSON.stringify({ name, email, photoUrl })
      });
      setAccount(response.data);
      onChanged(response.data);
      setProfileNotice("Dados da conta atualizados.");
    } catch (nextError) { setError(friendlyError(nextError)); }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault(); setError(""); setSecurityNotice("");
    if (password !== confirmation) { setError("A confirmação precisa ser igual à nova senha."); return; }
    try {
      await api("/api/account/password", { method: "POST", body: JSON.stringify({ currentPassword, password }) });
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
            <div><strong>Foto de perfil</strong><p>PNG, JPG ou WebP de até 2 MB.</p><label className="button secondary compact file-button">Escolher foto<input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectPhoto} /></label>{photoUrl && <button type="button" className="text-action danger" onClick={() => setPhotoUrl(null)}>Remover</button>}</div>
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
          <p className="account-card-copy">Use pelo menos 12 caracteres. Em produção, a alteração exigirá uma sessão recente.</p>
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

