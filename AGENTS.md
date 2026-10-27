# Project Architecture Rules

- Daily earnings JSON/CSV exports aggregate saved shift pay by date and client in a tested shared helper; this prevents current rate changes from altering historical downloads.

- Batch invoice downloads use client-side JSZip with one vector PDF per invoice so records remain individually shareable.
- Weekly card batch exports split selected dates by the preferred week start and client, and reuse the weekly receipt vector PDF renderer so single and batch documents stay consistent.
- Invoice period generation lives in a shared, tested helper; saved invoice identity matches both period boundaries and client so weekly and fortnightly records can coexist.