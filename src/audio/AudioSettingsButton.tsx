import { useEffect, useState } from "react";
import { Modal } from "../components/Modal";
import { PixelEmoji } from "../components/PixelEmoji";
import { gameAudio, type AudioSettings } from "./audioManager";

function percent(value: number): number {
  return Math.round(value * 100);
}

export function AudioSettingsButton() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AudioSettings>(() => gameAudio.getSettings());

  useEffect(() => gameAudio.subscribeSettings(setSettings), []);

  return (
    <>
      <button className="audio-settings-button" type="button" aria-label="사운드 설정 열기" onClick={() => setOpen(true)}><PixelEmoji emoji="⚙️" resolution={16} /></button>
      {open && (
        <Modal title="사운드 설정" onClose={() => setOpen(false)} cardClassName="audio-settings-modal">
          <div className="audio-volume-control">
            <label htmlFor="bgm-volume"><span>배경음</span><output>{percent(settings.bgmVolume)}%</output></label>
            <input
              id="bgm-volume"
              type="range"
              min="0"
              max="100"
              value={percent(settings.bgmVolume)}
              aria-label="배경음 볼륨"
              onChange={(event) => gameAudio.setBgmVolume(Number(event.target.value) / 100)}
            />
          </div>
          <div className="audio-volume-control">
            <label htmlFor="sfx-volume"><span>효과음</span><output>{percent(settings.sfxVolume)}%</output></label>
            <input
              id="sfx-volume"
              type="range"
              min="0"
              max="100"
              value={percent(settings.sfxVolume)}
              aria-label="효과음 볼륨"
              onChange={(event) => gameAudio.setSfxVolume(Number(event.target.value) / 100)}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
