//! The few strings NGA shows natively (menus, tray, timer alerts, the tray
//! tooltip) in English, French and Kinyarwanda. The shell's language setting
//! (Settings → General → Language) tells Rust which one through
//! `shell_set_lang`, which also rebuilds the menus.

use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    En = 0,
    Fr = 1,
    Rw = 2,
}

static CURRENT: AtomicU8 = AtomicU8::new(0);
const STORE_KEY: &str = "lang";

impl Lang {
    pub fn parse(s: &str) -> Option<Lang> {
        match s {
            "en" => Some(Lang::En),
            "fr" => Some(Lang::Fr),
            "rw" => Some(Lang::Rw),
            _ => None,
        }
    }
    fn code(self) -> &'static str {
        match self {
            Lang::En => "en",
            Lang::Fr => "fr",
            Lang::Rw => "rw",
        }
    }
}

pub fn current() -> Lang {
    match CURRENT.load(Ordering::Relaxed) {
        1 => Lang::Fr,
        2 => Lang::Rw,
        _ => Lang::En,
    }
}

fn set_current(lang: Lang) {
    CURRENT.store(lang as u8, Ordering::Relaxed);
}

/// Startup: the language the shell chose last time (menus are built before the shell loads).
pub fn load<R: Runtime>(app: &AppHandle<R>) {
    if let Some(lang) = app
        .store("settings.json")
        .ok()
        .and_then(|s| s.get(STORE_KEY))
        .and_then(|v| v.as_str().and_then(Lang::parse))
    {
        set_current(lang);
    }
}

/// A native string in the current language (English when a key is unknown).
pub fn t(key: &str) -> &'static str {
    lookup(current(), key)
}

/// A native string with `{name}`-style placeholders filled in.
pub fn tf(key: &str, vars: &[(&str, &str)]) -> String {
    let mut s = t(key).to_string();
    for (k, v) in vars {
        s = s.replace(&format!("{{{k}}}"), v);
    }
    s
}

fn lookup(lang: Lang, key: &str) -> &'static str {
    let Some(row) = STRINGS.iter().find(|r| r.0 == key) else {
        return "";
    };
    match lang {
        Lang::En => row.1,
        Lang::Fr => row.2,
        Lang::Rw => row.3,
    }
}

/// (key, English, French, Kinyarwanda)
const STRINGS: &[(&str, &str, &str, &str)] = &[
    // App menu bar
    ("menu.apps", "Apps", "Applications", "Porogaramu"),
    (
        "menu.nextApp",
        "Next App",
        "Application suivante",
        "Porogaramu ikurikira",
    ),
    (
        "menu.prevApp",
        "Previous App",
        "Application précédente",
        "Porogaramu ibanza",
    ),
    (
        "menu.search",
        "Search NGA…",
        "Rechercher dans NGA…",
        "Shakisha muri NGA…",
    ),
    ("menu.go", "Go", "Aller", "Jya"),
    ("menu.back", "Back", "Précédent", "Subira inyuma"),
    ("menu.forward", "Forward", "Suivant", "Komeza imbere"),
    ("menu.reload", "Reload", "Actualiser", "Ongera ufungure"),
    ("menu.print", "Print…", "Imprimer…", "Capa…"),
    (
        "menu.openBrowser",
        "Open in Browser",
        "Ouvrir dans le navigateur",
        "Fungura muri mushakisha",
    ),
    (
        "menu.copyLink",
        "Copy Page Link",
        "Copier le lien de la page",
        "Koporora umurongo w'urupapuro",
    ),
    ("menu.help", "Help", "Aide", "Ubufasha"),
    (
        "menu.shortcuts",
        "Keyboard Shortcuts",
        "Raccourcis clavier",
        "Uburyo bwihuse bwa clavier",
    ),
    ("menu.display", "Display", "Affichage", "Imigaragarire"),
    (
        "menu.focus",
        "Focus Mode",
        "Mode concentration",
        "Uburyo bwo kwibanda",
    ),
    (
        "menu.notifications",
        "Notifications",
        "Notifications",
        "Imenyesha",
    ),
    ("menu.tools", "Tools", "Outils", "Ibikoresho"),
    (
        "menu.theme",
        "Switch Light / Dark",
        "Basculer clair / sombre",
        "Hindura urumuri / umwijima",
    ),
    ("menu.zoomIn", "Zoom In", "Agrandir", "Kuza hafi"),
    ("menu.zoomOut", "Zoom Out", "Réduire", "Gushyira kure"),
    (
        "menu.actualSize",
        "Actual Size",
        "Taille réelle",
        "Ingano nyayo",
    ),
    // Tray
    ("tray.show", "Show NGA", "Afficher NGA", "Erekana NGA"),
    ("tray.quit", "Quit NGA", "Quitter NGA", "Funga NGA burundu"),
    (
        "tray.new",
        "NGA: {n} new",
        "NGA : {n} nouveau(x)",
        "NGA: {n} bishya",
    ),
    // Popups (tab right-click, toolbar "more")
    ("popup.open", "Open", "Ouvrir", "Fungura"),
    (
        "popup.home",
        "Go to Start Page",
        "Aller à la page d'accueil",
        "Jya ku rupapuro rw'itangiriro",
    ),
    (
        "popup.mute",
        "Mute Notifications",
        "Désactiver les notifications",
        "Hagarika imenyesha",
    ),
    (
        "popup.themeMis",
        "Follow My NGA Account",
        "Suivre mon compte NGA",
        "Kurikiza konti yanjye ya NGA",
    ),
    ("popup.light", "Light", "Clair", "Urumuri"),
    ("popup.dark", "Dark", "Sombre", "Umwijima"),
    (
        "popup.system",
        "Match This Computer",
        "Comme cet ordinateur",
        "Bihuze na mudasobwa",
    ),
    (
        "popup.downloads",
        "Show Downloads",
        "Afficher les téléchargements",
        "Erekana ibyakuruwe",
    ),
    ("popup.settings", "Settings", "Paramètres", "Igenamiterere"),
    (
        "toast.linkCopied",
        "Link copied",
        "Lien copié",
        "Umurongo wakoporowe",
    ),
    // Timer alerts
    ("timer.timer", "Timer", "Minuteur", "Igihe"),
    ("timer.focus", "Focus", "Concentration", "Kwibanda"),
    (
        "timer.closed",
        "Finished while NGA was closed",
        "Terminé pendant que NGA était fermé",
        "Byarangiye NGA ifunze",
    ),
    ("timer.up", "Time's up", "Temps écoulé", "Igihe kirarangiye"),
    (
        "timer.break",
        "Break time — {name}",
        "Pause — {name}",
        "Igihe cy'ikiruhuko — {name}",
    ),
    (
        "timer.breakBody",
        "Round {round} of {rounds} done. Stand up, stretch, rest your eyes.",
        "Tour {round} sur {rounds} terminé. Levez-vous, étirez-vous, reposez vos yeux.",
        "Icyiciro cya {round} muri {rounds} kirarangiye. Haguruka, irambure, uruhuke amaso.",
    ),
    (
        "timer.back",
        "Back to focus — {name}",
        "On se reconcentre — {name}",
        "Garuka wibande — {name}",
    ),
    (
        "timer.round",
        "Round {round} of {rounds}",
        "Tour {round} sur {rounds}",
        "Icyiciro cya {round} muri {rounds}",
    ),
    (
        "timer.done",
        "Focus session done — {name}",
        "Session de concentration terminée — {name}",
        "Igihe cyo kwibanda kirarangiye — {name}",
    ),
    (
        "timer.done.body",
        "{min} min of focused work. Well done!",
        "{min} min de travail concentré. Bravo !",
        "Iminota {min} yo gukora wibanze. Ni byiza cyane!",
    ),
    ("timer.app", "NGA Tools", "Outils NGA", "Ibikoresho bya NGA"),
];

/// The shell's language changed (or the shell just loaded): native strings follow.
#[tauri::command]
pub fn shell_set_lang<R: Runtime>(app: AppHandle<R>, lang: String) -> Result<(), String> {
    let lang = Lang::parse(&lang).ok_or("unknown language")?;
    if lang == current() {
        return Ok(());
    }
    set_current(lang);
    if let Ok(store) = app.store("settings.json") {
        store.set(STORE_KEY, serde_json::Value::String(lang.code().into()));
        let _ = store.save();
    }
    crate::menus::rebuild(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_string_has_all_three_languages_and_the_same_placeholders() {
        let holes = |s: &str| {
            let mut v: Vec<String> = s
                .split('{')
                .skip(1)
                .filter_map(|p| p.split_once('}').map(|(k, _)| k.to_string()))
                .collect();
            v.sort();
            v
        };
        let mut keys = std::collections::HashSet::new();
        for (k, en, fr, rw) in STRINGS {
            assert!(keys.insert(*k), "duplicate key {k}");
            assert!(!en.is_empty() && !fr.is_empty() && !rw.is_empty(), "{k}");
            assert_eq!(holes(en), holes(fr), "{k} fr");
            assert_eq!(holes(en), holes(rw), "{k} rw");
        }
    }

    #[test]
    fn lookups_fall_back_and_fill_placeholders() {
        assert_eq!(lookup(Lang::Fr, "tray.quit"), "Quitter NGA");
        assert_eq!(lookup(Lang::Rw, "menu.tools"), "Ibikoresho");
        assert_eq!(lookup(Lang::En, "no.such.key"), "");
        assert_eq!(Lang::parse("de"), None);
        set_current(Lang::En);
        assert_eq!(
            tf("timer.round", &[("round", "2"), ("rounds", "4")]),
            "Round 2 of 4"
        );
    }
}
