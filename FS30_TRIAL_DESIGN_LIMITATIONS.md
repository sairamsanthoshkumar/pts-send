# FS30 Trial Design Limitations

- Generated phase, treatment, arm, and trial-set records are source-linked. Editing or deleting an existing trial element can be carried through to its generated subject-element data; adding a new arbitrary element requires manual updates in trial design and `SE`.
- Dose rests and dose holidays are not inferred and must be added manually.
- When a group has multiple regimens because of dose changes, the first regimen supplies `TX.GRPLBL` and `TX.TRTDOS`. The affected regimen `TEDUR` and any clarifying label or `SEE PROTOCOL` text require manual editing.
- For embryo-fetal developmental (EFD) studies, a gestation phase starts at the confirmed mating date. Group/subgroup assignments and necropsy schedules remain the source of the generated trial arms, elements, and subject-element records.