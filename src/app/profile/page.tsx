import { ModulePage } from "@/components/module-page";

export default function ProfilePage() {
  return (
    <ModulePage
      eyebrow="Аккаунт · Настройки"
      title="Профиль пользователя"
      description="Игровая идентичность участника, его коллектив, роль и персональная история взаимодействия с кланом."
      features={["Вход через Discord", "Игровой ник и персонажи", "Принадлежность к коллективу", "Клановая роль и права", "Собственные заявки и история операций"]}
    >
      <div className="profile-preview">
        <div className="profile-avatar">DK</div>
        <div className="profile-details"><small>Профиль участника</small><strong>Ваш Discord-профиль</strong><span>Коллектив и роль будут назначены после входа</span></div>
        <div className="discord-pill">Discord</div>
      </div>
    </ModulePage>
  );
}
