# People profile controls

Creating a person links Projects through Objects. The separate comma-separated project-name field is removed from creation; existing stored project labels are preserved. Project selection still uses the native Projects relationship path, while other object links retain their existing save paths, CSRF, validation, and ownership rules.

`PeopleObjectPicker` is shared by create-time Objects and the existing-profile Add to object dialog. Icon-and-label filters distinguish People, Organizations, Projects, Resources, Notes, and Other (currently Lists and Finance accounts). Search is case- and accent-insensitive and supports multiple words. It searches the selected type, preserves duplicate titles as distinct canonical targets, and paginates results in groups of 60. Choosing an object only stages it; the existing Add object or Add to object action saves it. Already-linked targets and the current profile are excluded by the parent. Arrow Down moves from search to results; arrows/Home/End navigate results; Enter selects; Escape dismisses only the picker and restores trigger focus.

Group choices retain their accessible native checkboxes beneath the chip. Two explicit decorative layers animate a green fill and passing crest, with the label above both. The state transition is bounded to 520ms and is disabled for reduced motion. Email and phone values use the standard body font in profile properties and creation.

The Life dream role uses Sunrise. Duplicate tooltips read `1 Possible Duplicate` or `N Possible Duplicates`, and keep `No Duplicates Detected` when clear. The Style Guide records the icon choices and warning-tooltip wording.

Verification uses synthetic records only. Existing People regression coverage exercises all three viewport sizes, canonical object selection, save paths and unlink preservation. Object-picker checks cover type filtering, search, empty recovery, keyboard navigation and nested Escape dismissal. Live verification is read-only apart from the explicitly requested Style Guide icon records.
