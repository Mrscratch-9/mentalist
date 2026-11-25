/** About / Credits: attributions required by Fandom (CC BY-SA), TMDB, OpenStreetMap, Protomaps and the fonts. */
export const TMDB_NOTICE = "This product uses the TMDB API but is not endorsed or certified by TMDB.";

export function Credits() {
  return (
    <div className="rr-credits">
      <section aria-labelledby="cr-fandom">
        <h3 id="cr-fandom">The Mentalist Wiki (Fandom)</h3>
        <p>
          Fan notes and some episode and character text are adapted from <strong>The Mentalist Wiki</strong>,{" "}
          <span className="rr-url">https://thementalist.fandom.com</span>, written by Fandom contributors.
        </p>
        <p>
          Text adapted and available under <strong>CC BY-SA 3.0</strong>{" "}
          (<span className="rr-url">https://creativecommons.org/licenses/by-sa/3.0/</span>). Each fan note lists its page
          and revision link. Changes were made: text was shortened, reformatted and filtered by episode.
        </p>
      </section>
      <section aria-labelledby="cr-tmdb">
        <h3 id="cr-tmdb">TMDB</h3>
        <img className="rr-tmdb-logo" src="/credits/tmdb-logo.svg" alt="TMDB logo" width="120" height="16" />
        <p>{TMDB_NOTICE}</p>
        <p>Episode synopses and air dates come from TMDB. <span className="rr-url">https://www.themoviedb.org</span></p>
      </section>
      <section aria-labelledby="cr-map">
        <h3 id="cr-map">Map</h3>
        <p>© OpenStreetMap contributors (ODbL). Basemap tiles and styles by Protomaps.</p>
      </section>
      <section aria-labelledby="cr-fonts">
        <h3 id="cr-fonts">Fonts</h3>
        <p>Noto Sans (SIL Open Font License) for map labels · Inter · Courier Prime.</p>
      </section>
    </div>
  );
}
