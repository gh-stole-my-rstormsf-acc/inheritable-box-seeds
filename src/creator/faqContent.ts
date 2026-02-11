export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export interface FaqCategory {
  id: string;
  title: string;
  description: string;
  entries: FaqEntry[];
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: 'basics',
    title: 'Basics',
    description: 'What this tool does, what it outputs, and what it does not do.',
    entries: [
      {
        id: 'basics-what-is-seed-vault',
        question: 'What is Seed Vault Creator?',
        answer:
          'Seed Vault Creator is a local, browser-based wizard that packages seed phrases, HD paths, optional files, and recovery metadata into an encrypted vault HTML file.'
      },
      {
        id: 'basics-what-is-generated',
        question: 'What files do I get at the end?',
        answer:
          'Finalize produces two artifacts: a self-contained seed vault HTML file and a ciphertext instructions markdown file. Both are downloaded explicitly with dedicated buttons.'
      },
      {
        id: 'basics-offline-goal',
        question: 'Is this intended to be used offline?',
        answer:
          'Yes. The design target is offline usage after loading the app. The generated vault HTML is self-contained and meant to be opened locally without external dependencies.'
      },
      {
        id: 'basics-wallet-integration',
        question: 'Does this connect to MetaMask or hardware wallets?',
        answer:
          'No. The creator does not connect to wallet extensions or devices. You enter seed phrases and paths manually, and only derived addresses are shown for verification.'
      },
      {
        id: 'basics-main-vs-vault',
        question: 'What is the difference between Creator and Vault HTML?',
        answer:
          'Creator is the setup wizard where you define data and encryption. Vault HTML is the encrypted output that is opened later to decrypt and review stored data.'
      },
      {
        id: 'basics-seed-vault-html-faq',
        question: 'Will this FAQ appear inside downloaded vault files?',
        answer:
          'No. FAQ content is creator-only UI and is not embedded into generated vault runtime pages.'
      },
      {
        id: 'basics-is-this-backend',
        question: 'Is there a backend service storing my data?',
        answer:
          'No backend is used by the creator flow. The vault is generated client-side, and downloads are triggered directly in the browser.'
      }
    ]
  },
  {
    id: 'security-model',
    title: 'Security Model',
    description: 'Cryptographic framing and recovery model.',
    entries: [
      {
        id: 'security-model-encryption-stack',
        question: 'What cryptography is used for vault encryption?',
        answer:
          'Vault encryption uses a post-quantum hybrid key exchange flow combined with AES-256-GCM for authenticated encryption of the payload.'
      },
      {
        id: 'security-model-password-kdf',
        question: 'How is password mode key material derived?',
        answer:
          'Password mode uses Argon2id key derivation. The selected Argon2 settings are included in metadata so decryption can reproduce the same derivation parameters.'
      },
      {
        id: 'security-model-shamir-seed',
        question: 'How is Shamir mode protected?',
        answer:
          'Shamir mode creates a random master seed, splits it into threshold shares, and uses that material for hybrid key recovery. Decryption requires enough valid shares.'
      },
      {
        id: 'security-model-authenticated-encryption',
        question: 'How is tampering detected?',
        answer:
          'AES-GCM authentication is used. Decryption fails if ciphertext, nonce, or authenticated metadata do not match expected values.'
      },
      {
        id: 'security-model-no-private-key-export',
        question: 'Are private keys exported or shown?',
        answer:
          'No private keys are exported by this workflow. The vault runtime focuses on showing stored seed data and derivation outputs for address verification.'
      },
      {
        id: 'security-model-memory-hygiene',
        question: 'Is sensitive data cleared from memory?',
        answer:
          'The implementation zeroes sensitive byte arrays in key paths and clears in-memory creator state after generation where possible, reducing residual exposure.'
      },
      {
        id: 'security-model-threat-boundary',
        question: 'Does this protect against a fully compromised device?',
        answer:
          'No client-side tool can fully protect against a compromised host. The model assumes you operate in a trusted environment with careful offline handling.'
      }
    ]
  },
  {
    id: 'wizard-flow',
    title: 'Wizard Flow',
    description: 'Step ordering, validation behavior, and navigation rules.',
    entries: [
      {
        id: 'wizard-flow-step-order',
        question: 'What is the required step order?',
        answer: 'The wizard order is Seeds, Paths, Files, Security, and Finalize.'
      },
      {
        id: 'wizard-flow-jump-steps',
        question: 'Can I jump directly to later steps?',
        answer:
          'You can click later step tabs, but forward movement is gated by validation and security rules. Invalid or incomplete earlier steps block navigation.'
      },
      {
        id: 'wizard-flow-step-errors',
        question: 'When do red validation errors appear?',
        answer:
          'Errors are armed on navigation attempts. After fields are corrected, error highlighting clears immediately rather than waiting for another full submit.'
      },
      {
        id: 'wizard-flow-status-banner',
        question: 'What does the status banner represent?',
        answer:
          'The status banner reports the most recent informational or error outcome, such as file attachment limits, share preparation status, or generation failures.'
      },
      {
        id: 'wizard-flow-back-navigation',
        question: 'Will Back reset what I entered?',
        answer:
          'No. Before generation, Back keeps state in memory so previous fields stay populated. After generation, Back is disabled for the session.'
      },
      {
        id: 'wizard-flow-finalize-gate',
        question: 'Why is Next disabled in Shamir security mode?',
        answer:
          'In Shamir mode, Next to Finalize is disabled until shares are generated and reviewed for the exact current state fingerprint.'
      },
      {
        id: 'wizard-flow-state-after-generate',
        question: 'What happens to creator input after generating?',
        answer:
          'Sensitive fields are cleared after successful generation, generation/back controls are locked for the session, and download artifacts remain available on Finalize.'
      }
    ]
  },
  {
    id: 'seeds-mnemonics',
    title: 'Seeds and Mnemonics',
    description: 'Seed labels, phrase validation, and multi-seed behavior.',
    entries: [
      {
        id: 'seeds-mnemonics-word-counts',
        question: 'Which mnemonic lengths are accepted?',
        answer:
          'BIP-39 mnemonic validation accepts standard phrase lengths such as 12, 18, or 24 words with checksum checks.'
      },
      {
        id: 'seeds-mnemonics-normalization',
        question: 'Is mnemonic text normalized before encryption?',
        answer:
          'Yes. Mnemonics are normalized before vault data assembly to reduce formatting inconsistencies from user input.'
      },
      {
        id: 'seeds-mnemonics-label-rules',
        question: 'Do seed labels need to be unique?',
        answer:
          'Yes. Empty labels are not allowed and duplicate labels are rejected so seed-related outputs remain unambiguous.'
      },
      {
        id: 'seeds-mnemonics-default-labels',
        question: 'How are default seed labels assigned?',
        answer:
          'New seeds are auto-labeled by index (for example, Seed 1, Seed 2) and can be renamed at any time before generation.'
      },
      {
        id: 'seeds-mnemonics-remove-last',
        question: 'Can I remove every seed card?',
        answer:
          'If all seeds are removed, the UI immediately recreates a default seed card so the wizard always has at least one seed container.'
      },
      {
        id: 'seeds-mnemonics-multi-seed',
        question: 'Can one vault include multiple seed phrases?',
        answer:
          'Yes. You can add multiple seeds, each with independent paths and passphrase settings, and the resulting vault stores each seed entry separately.'
      },
      {
        id: 'seeds-mnemonics-bad-checksum',
        question: 'What if checksum validation fails?',
        answer:
          'Invalid mnemonic inputs are marked with field error styling and block forward navigation until corrected.'
      }
    ]
  },
  {
    id: 'paths-passphrases',
    title: 'Paths and Passphrases',
    description: 'HD path presets, custom paths, preview rules, and passphrase labeling.',
    entries: [
      {
        id: 'paths-passphrases-per-seed',
        question: 'Are paths global or per seed?',
        answer:
          'Paths are managed per seed. Each seed card has its own Add Path action and path list.'
      },
      {
        id: 'paths-passphrases-presets',
        question: 'Can I use presets and still customize paths?',
        answer:
          'Yes. You can start from a preset, then switch to a custom path value when needed.'
      },
      {
        id: 'paths-passphrases-label-behavior',
        question: 'How do path labels auto-update?',
        answer:
          'Auto labels track seed name, preset label, and path index until you manually override the label, after which the custom label is preserved.'
      },
      {
        id: 'paths-passphrases-derive-count-range',
        question: 'What is the allowed address count per path?',
        answer:
          'Each path derive count must be between 1 and 100. Out-of-range values are rejected and shown as field errors.'
      },
      {
        id: 'paths-passphrases-preview',
        question: 'How does address preview work?',
        answer:
          'Preview runs asynchronously via a worker and updates each path card with status plus an address table when input is valid.'
      },
      {
        id: 'paths-passphrases-passphrase-label-required',
        question: 'When is passphrase label required?',
        answer:
          'If a BIP-39 passphrase value is set on a path, a passphrase label is required for that path.'
      },
      {
        id: 'paths-passphrases-remove-only-path',
        question: 'Why can I not remove a seed’s last remaining path?',
        answer:
          'Remove is disabled when a seed has only one path. A tooltip explains that the only path cannot be removed.'
      }
    ]
  },
  {
    id: 'files',
    title: 'File Attachments',
    description: 'Optional encrypted file bundle behavior and limits.',
    entries: [
      {
        id: 'files-optional-feature',
        question: 'Are file attachments required?',
        answer:
          'No. File attachments are optional and can be disabled, in which case only seed and path data are included.'
      },
      {
        id: 'files-enable-toggle',
        question: 'What happens when I enable file attachments?',
        answer:
          'Enabling reveals file input and file metadata fields so selected files can be bundled into the encrypted vault payload.'
      },
      {
        id: 'files-limits',
        question: 'What are current attachment limits?',
        answer:
          'The creator enforces a maximum of 12 files and 25 MB total attachment size.'
      },
      {
        id: 'files-labels-required',
        question: 'Do attached files need labels?',
        answer:
          'Yes. Each attached file requires a display label, and missing labels block forward navigation when file attachments are enabled.'
      },
      {
        id: 'files-open-hints',
        question: 'What is the Open Hint field for?',
        answer:
          'Open Hint stores guidance for future recovery, such as which app should open or import the file after decryption.'
      },
      {
        id: 'files-safe-filename',
        question: 'Are file names sanitized?',
        answer:
          'Yes. File names are sanitized before storage to avoid unsafe path characters and keep download behavior predictable.'
      },
      {
        id: 'files-vault-runtime-recovery',
        question: 'How do I recover attached files later?',
        answer:
          'After decryption in vault runtime, attached files appear in a table with per-file download controls and stored metadata.'
      }
    ]
  },
  {
    id: 'password-mode',
    title: 'Password Mode',
    description: 'Password encryption workflow, Argon2 options, and expected behavior.',
    entries: [
      {
        id: 'password-mode-required-fields',
        question: 'Which fields are required in password mode?',
        answer:
          'Password and confirmation are required. Confirmation must exactly match the password to continue.'
      },
      {
        id: 'password-mode-strength-meter',
        question: 'How is password strength shown?',
        answer:
          'A simple strength indicator updates as you type, based on length and character diversity heuristics.'
      },
      {
        id: 'password-mode-argon-preset',
        question: 'What Argon2 options are available?',
        answer:
          'You can select built-in presets or custom parameters. Custom values are validated before generation proceeds.'
      },
      {
        id: 'password-mode-custom-validation',
        question: 'What if custom Argon2 values are invalid?',
        answer:
          'Invalid custom Argon2 settings trigger helper error text and block progression until values are corrected.'
      },
      {
        id: 'password-mode-hint',
        question: 'Is password hint required?',
        answer:
          'No. Hint is optional metadata and can be left empty.'
      },
      {
        id: 'password-mode-fast-crypto',
        question: 'What is the fast crypto option used in development?',
        answer:
          'A test-only fast Argon2 mode exists for local/dev runs. It is explicitly blocked in production builds.'
      },
      {
        id: 'password-mode-wrong-password',
        question: 'What happens if I decrypt with the wrong password?',
        answer:
          'Vault decryption fails with an error and no plaintext seed data is rendered.'
      }
    ]
  },
  {
    id: 'shamir-mode',
    title: 'Shamir Mode',
    description: 'Share generation lifecycle, gating, and recovery constraints.',
    entries: [
      {
        id: 'shamir-mode-threshold-rule',
        question: 'What are valid threshold and total share values?',
        answer:
          'Threshold must be at least 2, and total shares must be greater than or equal to threshold.'
      },
      {
        id: 'shamir-mode-prepare-required',
        question: 'Why must I generate shares before Finalize?',
        answer:
          'The flow requires share preparation on the Security step so Finalize can reuse reviewed output and avoid generating unseen shares later.'
      },
      {
        id: 'shamir-mode-fingerprint-gate',
        question: 'What invalidates prepared shares?',
        answer:
          'Any change that alters the current data fingerprint, including seed/path/file/security parameters tied to share generation, invalidates prepared shares.'
      },
      {
        id: 'shamir-mode-regenerate',
        question: 'Can I regenerate shares before finalizing?',
        answer:
          'Yes. The prepare action can regenerate shares when needed, and the latest prepared set is what Finalize uses.'
      },
      {
        id: 'shamir-mode-display-formats',
        question: 'Why are shares shown in both words and hex?',
        answer:
          'The UI supports word and hex display modes to accommodate different recording and operational workflows.'
      },
      {
        id: 'shamir-mode-share-prefix',
        question: 'Why must share input include an ID prefix?',
        answer:
          'Vault runtime expects share strings with an identifier prefix (for example, 1: ...). Missing prefixes fail validation.'
      },
      {
        id: 'shamir-mode-finalize-reuse',
        question: 'Does Finalize create a fresh Shamir split?',
        answer:
          'No. Finalize reuses the prepared Shamir output from Security for the current state fingerprint.'
      }
    ]
  },
  {
    id: 'finalize-downloads',
    title: 'Finalize and Downloads',
    description: 'Generation lifecycle and artifact handling.',
    entries: [
      {
        id: 'finalize-downloads-generate-button',
        question: 'What does Generate Vault do?',
        answer:
          'Generate Vault encrypts the current data model and prepares downloadable artifacts in memory for the current session.'
      },
      {
        id: 'finalize-downloads-no-auto-save',
        question: 'Does generation automatically save files to disk?',
        answer:
          'No. Generation does not auto-save. You must click explicit download buttons for HTML and markdown outputs.'
      },
      {
        id: 'finalize-downloads-html-purpose',
        question: 'What is the purpose of Download Seed Vault HTML?',
        answer:
          'It downloads the encrypted runtime container that can later be opened locally to decrypt and inspect stored data.'
      },
      {
        id: 'finalize-downloads-md-purpose',
        question: 'What is the purpose of Download Ciphertext Instructions (.md)?',
        answer:
          'It provides an operator-friendly record of ciphertext package details and dependency context for independent verification workflows.'
      },
      {
        id: 'finalize-downloads-summary-chips',
        question: 'What do Finalize summary chips represent?',
        answer:
          'They summarize current counts such as seeds, files, paths, and active security mode so you can verify scope before generating.'
      },
      {
        id: 'finalize-downloads-repeat-generation',
        question: 'Can I regenerate after making changes?',
        answer:
          'Not in the same session. After generation, controls stay locked; refresh and re-enter inputs to generate a new artifact set.'
      }
    ]
  },
  {
    id: 'vault-runtime',
    title: 'Vault Runtime and Recovery',
    description: 'Using the generated vault file after creation.',
    entries: [
      {
        id: 'vault-runtime-open-file',
        question: 'How do I open a generated vault?',
        answer:
          'Open the downloaded vault HTML file in a browser. It includes its own decryption UI and runtime logic.'
      },
      {
        id: 'vault-runtime-password-vs-shamir',
        question: 'How do decryption inputs differ by mode?',
        answer:
          'Password mode asks for a password. Shamir mode asks for enough valid shares that meet the threshold requirement.'
      },
      {
        id: 'vault-runtime-address-derivation',
        question: 'When are addresses derived in vault runtime?',
        answer:
          'Address derivation happens after successful decryption when you trigger the derive action in the runtime UI.'
      },
      {
        id: 'vault-runtime-derived-table',
        question: 'How are derived addresses shown?',
        answer:
          'Derived addresses are rendered in a compact table grouped by stored seed/path/passphrase context.'
      },
      {
        id: 'vault-runtime-passphrase-visibility',
        question: 'Are passphrases shown in plaintext by default?',
        answer:
          'No. Passphrases are hidden by default and exposed through reveal controls in runtime.'
      },
      {
        id: 'vault-runtime-csv-export',
        question: 'What does CSV export include for passphrases?',
        answer:
          'CSV export includes passphrase labels for context and does not include passphrase values.'
      },
      {
        id: 'vault-runtime-attached-files',
        question: 'Where do encrypted attachments appear after decrypting?',
        answer:
          'If files were bundled, runtime shows them in an attached files table with metadata and per-file download actions.'
      }
    ]
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Common errors and how to resolve them quickly.',
    entries: [
      {
        id: 'troubleshooting-cannot-next',
        question: 'Why can I not move to the next step?',
        answer:
          'A required field or step constraint is failing validation. Check the step error message and highlighted fields for the first blocking issue.'
      },
      {
        id: 'troubleshooting-mnemonic-invalid',
        question: 'Why is my mnemonic marked invalid?',
        answer:
          'Word count, spelling, ordering, or checksum may be wrong. Correct the phrase until validation reports a valid checksum.'
      },
      {
        id: 'troubleshooting-path-invalid',
        question: 'Why is my derivation path rejected?',
        answer:
          'The path format does not match allowed HD path template rules. Use a preset or adjust custom syntax until the path validator passes.'
      },
      {
        id: 'troubleshooting-passphrase-label',
        question: 'Why does passphrase label show as required?',
        answer:
          'A passphrase value is present for that path. Add a non-empty label or clear the passphrase field.'
      },
      {
        id: 'troubleshooting-shamir-next-disabled',
        question: 'Why is Next still disabled in Shamir mode?',
        answer:
          'Prepared shares are missing or stale for current state. Regenerate and review shares again in Security.'
      },
      {
        id: 'troubleshooting-download-not-working',
        question: 'Why did my download not start?',
        answer:
          'Ensure generation completed first and verify browser download permissions. Then retry the explicit download button.'
      },
      {
        id: 'troubleshooting-decrypt-failed',
        question: 'Why does vault decryption fail?',
        answer:
          'Most failures are incorrect password, malformed shares, insufficient shares, or a modified/corrupted vault file.'
      }
    ]
  }
];

export const FAQ_ENTRY_COUNT = FAQ_CATEGORIES.reduce((total, category) => total + category.entries.length, 0);
