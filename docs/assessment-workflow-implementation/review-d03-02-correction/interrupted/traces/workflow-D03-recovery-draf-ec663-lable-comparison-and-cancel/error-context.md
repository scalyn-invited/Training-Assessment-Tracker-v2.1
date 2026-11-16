# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workflow.spec.ts >> D03 recovery draft 409 retains complete local draft through denied/unavailable comparison and cancel
- Location: docs\assessment-workflow-implementation\review-d03-02-correction\browser-tests\workflow.spec.ts:654:3

# Error details

```
Test timeout of 90000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - heading "Synthetic isolated component QA" [level=1] [ref=e2]
  - generic [ref=e3]:
    - link "Back to assessments" [ref=e4] [cursor=pointer]:
      - /url: /assessments
    - banner [ref=e5]:
      - generic [ref=e6]:
        - paragraph [ref=e7]: ASSESSMENT BUILDER
        - heading "Build an assessment" [level=1] [ref=e8]
        - generic [ref=e9]:
          - paragraph [ref=e10]: Draft synthetic-definition · revision 1 · edit version 1
          - paragraph [ref=e11]: No direct copy source is recorded for this revision.
          - paragraph [ref=e12]: Existing assignments and team rules remain pinned to their original published revision. Saving a published definition creates a separate draft; it does not migrate assignments.
        - status [ref=e13]: "Publication conflict: the saved version changed and is still a draft. Writes are stopped. Your complete local draft remains here; compare before deciding to discard and reload."
        - button "Compare with saved definition" [ref=e14] [cursor=pointer]
        - generic [ref=e15]:
          - group [ref=e16]:
            - generic "Private structured comparison" [ref=e17] [cursor=pointer]
            - paragraph [ref=e18]: Author-only snapshot at comparison time. Includes answer keys. Nothing is exported or merged; neither version is overwritten.
            - heading "Local draft" [level=3] [ref=e19]
            - generic [ref=e20]: "{ \"id\": \"synthetic-definition\", \"version\": 1, \"revision\": 1, \"status\": \"draft\", \"title\": \"Synthetic two-section assessment\", \"threshold\": null, \"criteria\": [], \"questions\": [ { \"id\": \"A1\", \"type\": \"multiple_choice\", \"prompt\": \"Synthetic prompt A1\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] }, { \"id\": \"A2\", \"type\": \"multiple_choice\", \"prompt\": \"Synthetic prompt A2\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] }, { \"id\": \"B1\", \"type\": \"multiple_choice\", \"prompt\": \"Synthetic prompt B1\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] }, { \"id\": \"B2\", \"type\": \"multiple_choice\", \"prompt\": \"Synthetic prompt B2\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] } ], \"answer_key\": { \"A1\": \"yes\", \"A2\": \"yes\", \"B1\": \"yes\", \"B2\": \"yes\" }, \"sections\": [ { \"id\": \"a\", \"title\": \"Section A\", \"instructions\": \"First section\", \"question_ids\": [ \"A1\", \"A2\" ] }, { \"id\": \"b\", \"title\": \"Section B\", \"instructions\": \"Second section\", \"question_ids\": [ \"B1\", \"B2\" ] } ] }"
            - heading "Saved definition" [level=3] [ref=e21]
            - generic [ref=e22]: "{ \"id\": \"synthetic-definition\", \"version\": 2, \"revision\": 1, \"status\": \"draft\", \"title\": \"Concurrent saved content\", \"threshold\": null, \"criteria\": [], \"questions\": [ { \"id\": \"A1\", \"type\": \"multiple_choice\", \"prompt\": \"Other author prompt\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] }, { \"id\": \"A2\", \"type\": \"multiple_choice\", \"prompt\": \"Other author prompt\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] }, { \"id\": \"B1\", \"type\": \"multiple_choice\", \"prompt\": \"Other author prompt\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] }, { \"id\": \"B2\", \"type\": \"multiple_choice\", \"prompt\": \"Other author prompt\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] } ], \"answer_key\": { \"A1\": \"yes\", \"A2\": \"yes\", \"B1\": \"yes\", \"B2\": \"yes\" }, \"sections\": [ { \"id\": \"a\", \"title\": \"Section A\", \"instructions\": \"First section\", \"question_ids\": [ \"A1\", \"A2\" ] }, { \"id\": \"b\", \"title\": \"Section B\", \"instructions\": \"Second section\", \"question_ids\": [ \"B1\", \"B2\" ] } ] }"
          - button "Discard local edits and reload" [active] [ref=e23] [cursor=pointer]
      - button "Save draft" [disabled] [ref=e25]
    - paragraph [ref=e26]: Build at your pace. Save incomplete work, then review before publishing. Existing assignments keep their published revision.
    - navigation "Assessment sections" [ref=e27]:
      - button "1 Details" [ref=e28] [cursor=pointer]
      - button "2 Questions" [ref=e29] [cursor=pointer]
      - button "3 Rubric" [ref=e30] [cursor=pointer]
      - button "4 Review" [ref=e31] [cursor=pointer]
    - region "Review assessment" [ref=e32]:
      - heading "Review assessment" [level=2] [ref=e33]
      - generic [ref=e34]:
        - heading "Readiness checklist" [level=3] [ref=e35]
        - paragraph [ref=e37]: Ready for publication checks. The server verifies the saved revision before publishing.
        - paragraph [ref=e38]: Publishing freezes this revision for assignment. Existing assignments remain unchanged.
        - button "Publish assessment" [disabled] [ref=e39]
      - region "Learner preview" [ref=e40]:
        - heading "Learner preview" [level=3] [ref=e41]
        - paragraph [ref=e42]: Answer keys and the author rubric are excluded from this preview.
        - generic [ref=e43]:
          - heading "Synthetic two-section assessment" [level=4] [ref=e44]
          - paragraph [ref=e45]: Content preview — responses are not saved
          - paragraph [ref=e46]: Saved revision 1 · draft · version 1
          - paragraph [ref=e47]: "Content only: save, submission, permissions and file scanning are not simulated. Author rubric is separate; answer keys are not shown."
          - heading "Section A" [level=4] [ref=e48]
          - paragraph [ref=e49]: First section
          - article [ref=e50]:
            - heading "Section A — Question 1" [level=4] [ref=e51]
            - paragraph [ref=e53]: Synthetic prompt A1
            - group "Choose one answer" [ref=e54]:
              - generic [ref=e56]:
                - radio "Yes" [ref=e57]
                - text: "Yes"
              - generic [ref=e58]:
                - radio "No" [ref=e59]
                - text: "No"
          - article [ref=e60]:
            - heading "Section A — Question 2" [level=4] [ref=e61]
            - paragraph [ref=e63]: Synthetic prompt A2
            - group "Choose one answer" [ref=e64]:
              - generic [ref=e66]:
                - radio "Yes" [ref=e67]
                - text: "Yes"
              - generic [ref=e68]:
                - radio "No" [ref=e69]
                - text: "No"
          - heading "Section B" [level=4] [ref=e70]
          - paragraph [ref=e71]: Second section
          - article [ref=e72]:
            - heading "Section B — Question 3" [level=4] [ref=e73]
            - paragraph [ref=e75]: Synthetic prompt B1
            - group "Choose one answer" [ref=e76]:
              - generic [ref=e78]:
                - radio "Yes" [ref=e79]
                - text: "Yes"
              - generic [ref=e80]:
                - radio "No" [ref=e81]
                - text: "No"
          - article [ref=e82]:
            - heading "Section B — Question 4" [level=4] [ref=e83]
            - paragraph [ref=e85]: Synthetic prompt B2
            - group "Choose one answer" [ref=e86]:
              - generic [ref=e88]:
                - radio "Yes" [ref=e89]
                - text: "Yes"
              - generic [ref=e90]:
                - radio "No" [ref=e91]
                - text: "No"
      - generic [ref=e92]:
        - heading "Author rubric summary" [level=3] [ref=e93]
        - paragraph [ref=e95]: No rubric criteria.
  - heading "Learner section B" [level=2] [ref=e96]
  - heading "History all questions" [level=2] [ref=e97]
  - link "Recovery navigation probe" [ref=e98] [cursor=pointer]:
    - /url: /
```