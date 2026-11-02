import { ACKNOWLEDGEMENTS } from "../build/notices-data";

/** What `quiz --acknowledgements` prints: fullmark's licence and what it ships, the text of THIRD_PARTY_NOTICES.md. */
export const acknowledgements = (): string => ACKNOWLEDGEMENTS;
