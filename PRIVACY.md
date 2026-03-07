# Fire Summary Privacy Policy

Last updated: March 7, 2026

Fire Summary is a browser extension that summarizes the current webpage and lets the user ask follow-up questions about that summary. The extension uses the Gemini API key provided by the user and sends requests directly from the browser to Google's Generative Language API.

## What Data Fire Summary Processes

Fire Summary may process the following categories of data:

- Authentication information: the Gemini API key entered by the user.
- Website activity: the current page URL.
- Website content: the current page title, excerpt, extracted article text, generated summary, and follow-up discussion context.
- User-provided content: custom prompts, target language selection, follow-up questions, and extension settings.

## How Data Is Used

Fire Summary uses the data above only to provide the features explicitly requested by the user:

- Extract webpage content from the active tab.
- Send the requested content to Google's Generative Language API to generate summaries and follow-up answers.
- Store local settings and temporary cached results inside the browser so the extension can function.

Fire Summary does not operate any developer-controlled backend for this extension workflow.

## Where Data Is Sent

When the user runs a summary or follow-up request, Fire Summary sends the request directly to:

- `https://generativelanguage.googleapis.com/`

The request may include the current page URL, title, excerpt, extracted article text, follow-up question text, and the user's Gemini API key.

No browsing content is sent anywhere else by the extension.

## Local Storage and Retention

Fire Summary stores some data locally in the browser's extension storage:

- Settings such as model, language, prompt, and typography preferences.
- Summary cache entries.
- The latest discussion context and discussion history for the current summary flow.

Retention behavior:

- Summary cache entries are automatically pruned after 7 days or when the cache exceeds 20 entries.
- Discussion state and settings remain in local browser storage until the user clears extension data, overwrites the stored state, or removes the extension.

## Data Sharing

Fire Summary does not sell user data.

Fire Summary does not share user data with advertisers, data brokers, or analytics providers as part of the core extension workflow.

Data is shared only with Google’s Generative Language API when needed to perform the user-requested summary or follow-up generation.

## User Controls

Users can control their data by:

- Choosing whether to enter a Gemini API key.
- Clearing cached summaries from the extension settings page.
- Clearing browser extension storage or uninstalling the extension.
- Deciding which page to summarize and what follow-up questions to send.

## Contact

For privacy questions or policy updates, use the project repository:

- https://github.com/pjiaquan/fire-summary
