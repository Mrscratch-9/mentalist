/** About / Credits: attributions required by Fandom (CC BY-SA), TMDB, OpenStreetMap, Protomaps and the fonts. */
import { translator, type UiLang } from "../i18n/strings";

export function Credits({ lang }: { lang: UiLang }) {
  const t = translator(lang);
  return (
    <div className="rr-credits">
      <section aria-labelledby="cr-fandom">
        <h3 id="cr-fandom">{t("credits.fandomHead")}</h3>
        <p>
          {t("credits.fandomP1a")} <strong>The Mentalist Wiki</strong>,{" "}
          <span className="rr-url">https://thementalist.fandom.com</span>, {t("credits.fandomP1b")}
        </p>
        <p>
          {t("credits.fandomP2a")} <strong>CC BY-SA 3.0</strong>{" "}
          (<span className="rr-url">https://creativecommons.org/licenses/by-sa/3.0/</span>). {t("credits.fandomP2b")}
        </p>
      </section>
      <section aria-labelledby="cr-tmdb">
        <h3 id="cr-tmdb">{t("credits.tmdbHead")}</h3>
        <img className="rr-tmdb-logo" src="/credits/tmdb-logo.svg" alt={t("credits.tmdbLogo")} width="120" height="16" />
        <p>{t("credits.tmdbNotice")}</p>
        <p>{t("credits.tmdbData")} <span className="rr-url">https://www.themoviedb.org</span></p>
      </section>
      <section aria-labelledby="cr-map">
        <h3 id="cr-map">{t("credits.mapHead")}</h3>
        <p>{t("credits.mapBody")}</p>
      </section>
      <section aria-labelledby="cr-fonts">
        <h3 id="cr-fonts">{t("credits.fontsHead")}</h3>
        <p>{t("credits.fontsBody")}</p>
      </section>
    </div>
  );
}
