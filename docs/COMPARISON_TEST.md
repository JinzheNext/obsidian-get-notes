# Dual Sync Mode Comparison Checklist

Use this checklist to compare the same Get notes across:

- OpenAPI Mode
- Legacy Export Mode

Recommended output folders during V3:

- `00_Inbox/020 GetNotes/openapi/`
- `00_Inbox/020 GetNotes/legacy/`

| Case | OpenAPI Output | Legacy Output | Notes |
| --- | --- | --- | --- |
| Plain text note |  |  |  |
| Audio note |  |  |  |
| Long audio note |  |  |  |
| Meeting note |  |  |  |
| Link clipping / article excerpt |  |  |  |
| Note with tags |  |  |  |
| Note with attachment |  |  |  |
| Edited note |  |  |  |

## Case 1: Plain Text Note

Check:

- Title fidelity
- Created time
- Updated time
- Body content completeness
- Tags
- Markdown cleanliness

## Case 2: Audio Note

Check:

- Transcript presence
- Summary presence
- Audio file link
- Audio file downloaded or referenced
- Markdown readability

## Case 3: Long Audio Note

Check:

- No truncation
- Paragraph structure
- Performance
- File size handling

## Case 4: Meeting Note

Check:

- Speaker structure if available
- Summary
- Action items if available
- Transcript completeness

## Case 5: Link Clipping / Article Excerpt

Check:

- Original URL
- Article title
- Highlight content
- HTML residue
- Markdown links

## Case 6: Edited Note

Check:

- Whether OpenAPI detects update by `updated_at`
- Whether legacy creates duplicate or overwrites
- Whether output path remains stable

## Manual Test Notes

- Run both modes against the same account when possible.
- Compare outputs side by side rather than mixing folders.
- Record exact failures with the mode label included.
