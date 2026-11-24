# Brennstoffzellen-Simulator

Interaktive Simulation einer PEM-Brennstoffzelle (H₂/O₂ bzw. H₂/Luft) im Browser. Man stellt Betriebsbedingungen und Zellaufbau ein und sieht sofort Kennlinie, Verluste, Energiebilanz und die Werte eines ganzen Stacks. Entstanden als Lernwerkzeug für den Chemieunterricht und die CTA-Ausbildung.

## Funktionen

- **Animiertes Zellschema:** H₂ diffundiert zur Anode, H⁺ wandern durch die Membran, e⁻ fließen über den Verbraucher, an der Kathode entsteht Wasser. Die Animation läuft proportional zur Stromdichte.
- **U-j-Kennlinie und Leistungskurve** mit Betriebspunkt und Maximalleistung; bis zu drei Kurven lassen sich als Vergleich festhalten.
- **Energiebilanz:** Aufteilung der Brennwertspannung (1,481 V) in elektrische Arbeit, Aktivierung, ohmschen Verlust, Stofftransport und reversible Wärme.
- **Rechenweg:** Alle Gleichungen mit eingesetzten Zahlenwerten.
- **Stack-Werte:** Spannung, Strom, Leistung, Abwärme, H₂-/O₂-Verbrauch und Produktwasser nach Faraday.
- **Messprotokoll:** Messpunkte einzeln oder als automatische Kennlinie aufnehmen und als Tabelle kopieren (Excel, Numbers, Google Sheets).
- **Versuchsaufträge** für den Unterricht.

## Benutzen

Keine Installation nötig: `index.html` im Browser öffnen. Läuft auch auf Smartphone und Tablet.

Online über GitHub Pages: *Settings → Pages → Source: „Deploy from a branch“, Branch `main`, Ordner `/ (root)`*. Danach ist die Seite unter `https://<benutzername>.github.io/brennstoffzellen-simulator/` erreichbar.

## Einstellbare Größen

| Größe | Bereich | Standard |
|---|---|---|
| Stromdichte j | 0 bis Grenzstromdichte | 0,80 A/cm² |
| Zelltemperatur | 30–90 °C | 70 °C |
| Druck Anode / Kathode (absolut) | 1–3 bar | 1,5 bar |
| Kathodengas | Luft (21 % O₂) oder reiner O₂ | Luft |
| Befeuchtung der Gase | 20–100 % | 100 % |
| Membran | Nafion 211 / 212 / 115 / 117 (25–183 µm) | Nafion 212 |
| Platinbeladung Kathode | 0,05–0,6 mg/cm² | 0,4 mg/cm² |
| Zellen im Stack / aktive Fläche | 1–400 / 5–300 cm² | 60 / 100 cm² |

## Modell

Stationäres, isothermes 0D-Modell einer Einzelzelle (`js/model.js`):

```
U = E_N − η_akt − η_ohm − η_konz
```

**Nernst-Spannung** (flüssiges Produktwasser, Partialdrücke nach Abzug des Wasserdampfs):

```
E°(T) = 1,229 V − 0,846 mV/K · (T − 298,15 K)
E_N   = E°(T) + RT/(2F) · ln(p_H₂ · √p_O₂)
```

**Aktivierung** (nur Kathode, Butler-Volmer in arsinh-Form, H₂-Crossover als interner Strom j_n = 2 mA/cm²):

```
η_akt = RT/(αF) · arsinh((j + j_n) / (2 j₀)),   α = 1
j₀    = 1·10⁻⁶ A/cm² · (L_Pt / 0,4 mg/cm²) · exp(−66 kJ/mol / R · (1/T − 1/353 K)) · √(p_O₂ / 0,21 bar)
```

**Ohmscher Verlust** (Springer-Modell für Nafion plus 0,03 Ω·cm² Kontaktwiderstand):

```
λ     = 0,043 + 17,18 a − 39,85 a² + 36 a³          (a = relative Feuchte)
σ     = (0,005139 λ − 0,00326) · exp(1268 · (1/303 − 1/T))   in S/cm
η_ohm = j · (d_Membran / σ + R_Kontakt)
```

**Stofftransport** (empirisch):

```
η_konz = B · ln(j_L / (j_L − j)),   B = 0,07 V
j_L    = 4,5 A/cm² · p_O₂ / (p_O₂ + 0,37 bar)
```

### Grenzen

Nicht abgebildet sind das Fluten der Elektroden mit flüssigem Wasser, Temperaturverteilungen, Gasverarmung entlang des Kanals, Katalysatoralterung und dynamisches Verhalten. Bei niedriger Temperatur (um 30 °C) ist das Modell zu optimistisch: Echte Zellen sind dort deutlich schlechter, weil vor allem die Flutung fehlt. Die Parameter liegen in realistischen Bereichen, sind aber an keine bestimmte kommerzielle Zelle angepasst.

## Projektstruktur

```
index.html          Seite und Bedienelemente
css/style.css       Gestaltung, helles und dunkles Farbschema
js/model.js         Zellmodell (reine Funktionen, auch in Node nutzbar)
js/app.js           Oberfläche, Diagramm, Animation, Messprotokoll
tests/              Plausibilitätstests für das Modell
```

## Tests

Benötigt Node.js ≥ 22:

```
npm test
```

Die Tests prüfen unter anderem E° bei 25 °C, den Sättigungsdampfdruck, typische Kennlinienwerte, die geschlossene Energiebilanz und den H₂-Verbrauch nach Faraday.
