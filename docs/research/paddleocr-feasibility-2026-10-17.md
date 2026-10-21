# Fezabilitate PaddleOCR pe serverul aplicației

## Rezultatul pilotului și decizia finală

La 17 octombrie 2026 s-a instalat temporar un worker CPU izolat, cu două fire de inferență, cotă de 2 CPU și limită de 1,5 GiB RAM. S-au folosit modelele mobile v5 descrise mai jos, fără MKL-DNN, redimensionare la maximum 2000 × 2000 pixeli și un extractor conservator de câmpuri. Procesarea nu a modificat bonurile sau cheltuielile salvate și nu a efectuat apeluri API noi.

| Măsurătoare | Rezultat |
| --- | --- |
| Bon sintetic clar, trei rulări | 1,426–1,685 secunde |
| Bonuri reale evaluate | Cele mai recente 10 imagini eligibile, cu sumă pozitivă salvată |
| Timp minim / mediană / maxim | 5,605 / 18,554 / 24,783 secunde |
| Total și monedă acceptate local | 3 din 10; toate trei coincid cu valorile salvate |
| Dată identică valorii salvate | 1 din 10 |
| Rezultate acceptabile în limita de 8 secunde a adaptorului | 0 din 10 |
| Memorie observată în Docker în timpul procesării | Aproximativ 0,9–1,0 GiB; vârful cgroup a fost aproximativ 1,43 GiB |

Referința o reprezintă câmpurile Expense deja salvate, nu un set etichetat independent. Proporția 3/10 măsoară acoperirea extragerii locale de câmpuri în acest pilot, nu precizia caracterelor recunoscute de PaddleOCR. Nu s-a măsurat latența API pe aceleași documente. O variantă cu MKL-DNN era în pregătire, însă a fost oprită înaintea măsurătorilor, la cererea utilizatorului; nu există rezultate pentru acea variantă.

Pragul utilizatorului: recunoaștere cel puțin la fel de utilă ca modelele API existente. Pilotul actual nu justifică înlocuirea fluxului existent. La cererea utilizatorului s-au eliminat containerul, imaginea workerului, volumul său nou de cache, sursele și integrarea experimentală; backend-ul a fost readus la imaginea anterioară. Configurația furnizorilor API și volumele aplicației nu au fost modificate.

Restul documentului păstrează analiza inițială de compatibilitate și propunerile de atunci, nu o recomandare curentă de instalare. Mențiunile de mai jos despre lipsa instalării sau a măsurătorilor descriu etapa anterioară pilotului.

## Analiza inițială

Verificat la 17 octombrie 2026. Investigație de compatibilitate; nu s-au instalat pachete, descărcat modele sau rulat inferențe. Nu există măsurători locale de latență, precizie sau consum RAM pentru PaddleOCR.

## Verdict

Instalarea CPU este fezabilă la nivel de arhitectură și versiuni publicate. Integrarea în aplicație necesită un adaptor și extragerea câmpurilor din textul OCR. Recomandarea este un serviciu Python separat, cu modelele mobile pentru română și o singură inferență simultană la început. Acceptarea în producție depinde de un test controlat pe documente reprezentative și de măsurarea resurselor.

## Mașina verificată

Observațiile locale furnizate de investigația principală: Debian 13, x86_64, Intel Xeon E5-2699 v4, 24 procesoare logice vizibile, AVX2; aproximativ 7,8 GiB RAM total și 4,2 GiB disponibili, aproximativ 35 GiB liberi pe disc; Python 3.13.5. Nu s-au identificat `nvidia-smi` sau dispozitive `/dev/nvidia*`. Valorile de RAM și disc sunt instantanee, nu resurse rezervate. Aceste observații sunt mai recente decât estimările conservatoare din instrucțiunile depozitului; regulile de protejare a producției rămân aplicabile.

## Compatibilitate și instalare

Documentația oficială PaddlePaddle pentru Linux listează Python 3.9–3.13, arhitectură x86_64 și pachete CPU cu AVX/MKL. Hardware-ul verificat îndeplinește condițiile de arhitectură și instrucțiuni. GPU nu este necesar pentru varianta CPU. [Instalare oficială Linux](https://www.paddlepaddle.org.cn/documentation/docs/en/install/pip/linux-pip_en.html)

Metadatele PyPI consultate direct indică PaddlePaddle 3.3.1 și un wheel `paddlepaddle-3.3.1-cp313-cp313-manylinux1_x86_64.whl` de aproximativ 185,8 MiB. Există deci distribuție binară pentru Python 3.13; aceasta nu demonstrează că toate dependențele aplicației vor funcționa împreună. [Metadate PaddlePaddle](https://pypi.org/pypi/paddlepaddle/json)

PaddleOCR 3.7.0 declară Python >=3.8 în metadatele publicate. Documentația recomandă pachetul de bază `paddleocr` pentru OCR general și instalarea separată a motorului de inferență; grupul `[all]` adaugă funcții care nu sunt necesare acestui caz. [Metadate PaddleOCR](https://pypi.org/pypi/paddleocr/json), [Instalare PaddleOCR](https://www.paddleocr.ai/latest/en/version3.x/installation.html)

Pentru implementare, propunem un container cu mediu Python propriu și versiuni fixate după verificarea instalării. Python 3.11/3.12 poate fi o alegere conservatoare pentru ecosistem; schimbarea Python-ului gazdei nu este necesară. Consultarea Context7 a returnat și documentație mai veche pentru dependențele opționale HPI, limitată la Python 3.8–3.12; acea limitare nu trebuie extinsă la instalarea CPU standard.

## Modele și limba română

PP-OCRv5 documentează limba română cu `lang="ro"`, inclusă în familia `latin_PP-OCRv5_mobile_rec`. Suportul declarat trebuie validat pe bonuri și facturi reale, inclusiv diacritice, cifre, zecimale și fotografii neclare. [Limbi PP-OCRv5](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html)

Configurația propusă folosește `PP-OCRv5_mobile_det` și `latin_PP-OCRv5_mobile_rec`, cu `device="cpu"` și modulele opționale de orientare/deformare dezactivate pentru testul inițial. Documentația publică dimensiuni de stocare de 4,7 MB și 14 MB pentru aceste modele. Parametrul `cpu_threads` permite limitarea firelor de execuție; propunem inițial 2. Valorile de dimensiune reprezintă fișiere de model, nu RAM. Documentația actuală include și PP-OCRv6; selectarea explicită a modelelor v5 evită dependența de modele implicite schimbătoare. [Pipeline OCR și parametri](https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/OCR.html)

## Condiții pentru un pilot

- Serviciu intern separat; pachete și modele persistate în propriul mediu.
- Un worker și o inferență simultană; coadă și timeout explicite.
- Limite pentru dimensiunea imaginilor și numărul paginilor procesate.
- Măsurarea RAM maxim, CPU, timp la pornire și timp pe document, concomitent cu verificarea sănătății serviciilor existente.
- Compararea rezultatelor pe un set de bonuri/facturi românești, în special sumă, monedă, dată și comerciant.
- Bugetul de memorie al containerului se stabilește după măsurători. Cei 4,2 GiB disponibili nu reprezintă o garanție de capacitate în sarcină.

Acestea sunt propuneri de implementare și validare, nu benchmarkuri efectuate sau garanții ale furnizorului.

## Integrarea în aplicația existentă

Constatări din codul curent, verificate prin CodeGraph și citirea surselor:

- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OcrService.kt:391` execută lanțul de modele, cache-ul și comparațiile. `scanModel` la linia 608 trimite imagini unui serviciu multimodal și cere JSON cu `merchant`, `amount`, `currency`, `tax_amount`, `tax_rate`, `date`, `raw_text`, `category_id`, `description`. La linia 602, validarea rezultatului cere o sumă numerică finită și o monedă de trei litere majuscule. Textul returnat de OCR general nu satisface singur acest contract.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/OpenAiCompatibleClient.kt` folosește `/chat/completions`, mesaje multimodale și `response_format=json_object`. Permite numai HTTPS cu adrese publice și blochează localhost/rețele private. Prin urmare, un serviciu PaddleOCR intern nu poate fi configurat direct în interfața actuală, nici doar printr-un adaptor care schimbă forma răspunsului.
- [ADR-0006](../adr/0006-gui-managed-ai-provider-model-chains.md) precizează explicit că API-urile incompatibile necesită integrare în backend. Propunerea respectă această regulă printr-un client intern dedicat, cu destinație fixată în configurația serverului; nu prin relaxarea regulilor pentru URL-urile introduse din interfață.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/AsyncOcrService.kt:145` folosește `scanReceipt` în fluxul durabil existent. Acesta poate fi reutilizat pentru promovarea rezultatului în Expense și Receipt. `OcrService.kt` randează deja primele maximum cinci pagini ale unui PDF înaintea analizei.
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/config/AsyncConfig.kt:30` configurează 2–5 workeri OCR. Serviciul local trebuie să aibă propria limită inițială de o inferență simultană. Lease-ul din `AsyncOcrService.processJob` este de 60 secunde; pornirea modelelor, coada și documentele cu mai multe pagini pot depăși acest interval. Pilotul trebuie să preîncarce modelele și să verifice timpul total, apoi să limiteze așteptarea sau să implementeze reînnoirea lease-ului dacă este necesar.

Flux propus: `OcrJob → client intern Kotlin → PaddleOCR CPU → extragere câmpuri → validarea existentă → Expense/Receipt`.

Pentru extragerea câmpurilor există două variante: reguli locale validate pe bonuri reprezentative (procesare integral locală, cu acoperire de măsurat) sau un model AI care interpretează textul recunoscut (integrare hibridă, care păstrează dependența de un serviciu AI). PaddleOCR general nu înlocuiește automat interpretarea semantică realizată astăzi de modelele multimodale. Fallback-ul actual poate fi păstrat pentru rezultate incomplete, însă selecția serviciului local și identitatea cache-ului trebuie să includă versiunea modelelor și a extractorului.

Nu s-au modificat codul aplicației, configurația OCR, baza de date sau serviciile Docker. Raportul documentează fezabilitatea; instalarea efectivă și testele de inferență rămân de executat într-un pilot izolat.
