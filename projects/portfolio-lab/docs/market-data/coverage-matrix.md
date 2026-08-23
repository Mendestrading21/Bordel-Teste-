# Matrice de couverture — données de marché

- **Généré le** : 2026-08-23T00:00:00.000Z
- **Version de la définition** : 1
- **Instruments testés** : 19

## Légende

| Symbole | Signification |
|---|---|
| ✅ | Instrument résolu et valorisé |
| 🟡 | Résolu, mais aucun prix disponible |
| ❌ | Interrogé, instrument introuvable |
| ❓ | Plusieurs candidats, aucun départage possible |
| ➖ | Classe d'actifs non prise en charge |
| 🔥 | Erreur d'appel : réseau, quota ou authentification |
| ⬜ | **Jamais interrogé** — voir le motif de blocage |

⬜ n'est pas un échec de couverture : c'est l'absence de test. Confondre les
deux transformerait une lacune de vérification en conclusion.

## État des fournisseurs

| Fournisseur | Vérification | Bloqué par |
|---|---|---|
| Fournisseur simulé | `FIXTURE_TESTED` | Données simulées : ne remplace aucun fournisseur réel. |
| Twelve Data | `UNVERIFIED` | Adaptateur non implémenté. Requiert : (1) une clé d'API, (2) un accès réseau au fournisseur, (3) la vérification officielle du type de données, du délai, de la place de cotation et des droits d'usage personnel. Voir docs/market-data-integration.md. |
| Massive | `UNVERIFIED` | Adaptateur non implémenté. Requiert : (1) une clé d'API, (2) un accès réseau au fournisseur, (3) la vérification officielle du type de données, du délai, de la place de cotation et des droits d'usage personnel. Voir docs/market-data-integration.md. |
| EODHD | `UNVERIFIED` | Adaptateur non implémenté. Requiert : (1) une clé d'API, (2) un accès réseau au fournisseur, (3) la vérification officielle du type de données, du délai, de la place de cotation et des droits d'usage personnel. Voir docs/market-data-integration.md. |
| OpenFIGI | `UNVERIFIED` | Service de normalisation d'identifiants uniquement — ne fournit aucun prix. Adaptateur non implémenté. Requiert : (1) une clé d'API, (2) un accès réseau au fournisseur, (3) la vérification officielle du type de données, du délai, de la place de cotation et des droits d'usage personnel. Voir docs/market-data-integration.md. |

## Actions américaines

Priorité 1.

| Instrument | Identifiant | Fournisseur simulé | Twelve Data | Massive | EODHD | OpenFIGI |
|---|---|---|---|---|---|---|
| Apple Inc. | `US0378331005` | ✅ MANUAL | ⬜ | ⬜ | ⬜ | ⬜ |
| Microsoft Corp. | `US5949181045` | ✅ MANUAL | ⬜ | ⬜ | ⬜ | ⬜ |

## Actions suisses et européennes

Priorité 1.

| Instrument | Identifiant | Fournisseur simulé | Twelve Data | Massive | EODHD | OpenFIGI |
|---|---|---|---|---|---|---|
| Nestlé SA | `CH0038863350` | ✅ MANUAL | ⬜ | ⬜ | ⬜ | ⬜ |
| Novartis AG | `CH0012005267` | ❌ | ⬜ | ⬜ | ⬜ | ⬜ |
| ASML Holding NV | `NL0010273215` | ❌ | ⬜ | ⬜ | ⬜ | ⬜ |

## ETF américains

Priorité 1.

| Instrument | Identifiant | Fournisseur simulé | Twelve Data | Massive | EODHD | OpenFIGI |
|---|---|---|---|---|---|---|
| SPDR S&P 500 ETF Trust | `US78462F1030` | ✅ MANUAL | ⬜ | ⬜ | ⬜ | ⬜ |
| Invesco QQQ Trust | `US46090E1038` | ❌ | ⬜ | ⬜ | ⬜ | ⬜ |

## ETF européens et suisses

Priorité 2.

| Instrument | Identifiant | Fournisseur simulé | Twelve Data | Massive | EODHD | OpenFIGI |
|---|---|---|---|---|---|---|
| iShares Core MSCI World UCITS ETF | `IE00B4L5Y983` | ✅ MANUAL | ⬜ | ⬜ | ⬜ | ⬜ |
| iShares Core SPI ETF (CH) | `CH0237935652` | ❌ | ⬜ | ⬜ | ⬜ | ⬜ |

## Fonds Pictet — trois classes de parts distinctes

Priorité 1.

| Instrument | Identifiant | Fournisseur simulé | Twelve Data | Massive | EODHD | OpenFIGI |
|---|---|---|---|---|---|---|
| Pictet - Water P EUR | `LU0104884860` | ✅ NAV | ⬜ | ⬜ | ⬜ | ⬜ |
| Pictet - Water I EUR | `LU0104884787` | ❌ | ⬜ | ⬜ | ⬜ | ⬜ |
| Pictet - Security P USD | `LU0270904781` | ❌ | ⬜ | ⬜ | ⬜ | ⬜ |

## Autres fonds internationaux

Priorité 2.

| Instrument | Identifiant | Fournisseur simulé | Twelve Data | Massive | EODHD | OpenFIGI |
|---|---|---|---|---|---|---|
| Vanguard Global Stock Index Fund Inv EUR Acc | `IE00B03HCZ61` | ❌ | ⬜ | ⬜ | ⬜ | ⬜ |
| UBS (Lux) Fund Solutions – MSCI World UCITS ETF | `LU0340285161` | ❌ | ⬜ | ⬜ | ⬜ | ⬜ |

## Options américaines — deux sous-jacents, plusieurs échéances

Priorité 1.

| Instrument | Identifiant | Fournisseur simulé | Twelve Data | Massive | EODHD | OpenFIGI |
|---|---|---|---|---|---|---|
| AAPL CALL 200 15/01/2027 | `aapl-c-2027-01-15-200` | ✅ MANUAL | ⬜ | ⬜ | ⬜ | ⬜ |
| AAPL PUT 180 18/06/2027 | `aapl-p-2027-06-18-180` | ❌ | ⬜ | ⬜ | ⬜ | ⬜ |
| SPY CALL 600 15/01/2027 | `spy-c-2027-01-15-600` | ❌ | ⬜ | ⬜ | ⬜ | ⬜ |

## Paires de change vers le CHF

Priorité 1.

| Instrument | Identifiant | Fournisseur simulé | Twelve Data | Massive | EODHD | OpenFIGI |
|---|---|---|---|---|---|---|
| USD/CHF | `USD/CHF` | ✅ MANUAL | ⬜ | ⬜ | ⬜ | ⬜ |
| EUR/CHF | `EUR/CHF` | ✅ MANUAL | ⬜ | ⬜ | ⬜ | ⬜ |

## Synthèse

| Fournisseur | ✅ | 🟡 | ❌ | ➖ | 🔥 | ⬜ |
|---|---|---|---|---|---|---|
| Fournisseur simulé | 9 | 0 | 10 | 0 | 0 | 0 |
| Twelve Data | 0 | 0 | 0 | 0 | 0 | 19 |
| Massive | 0 | 0 | 0 | 0 | 0 | 19 |
| EODHD | 0 | 0 | 0 | 0 | 0 | 19 |
| OpenFIGI | 0 | 0 | 0 | 0 | 0 | 19 |
