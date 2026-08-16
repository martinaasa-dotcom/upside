/**
 * Witty loading-screen lines — genuinely random (Math.random, not seeded)
 * so repeat visits feel fresh rather than "today's line." Keep each one
 * short enough to sit on one line under the logo, and keep the mix wide
 * (money jokes, everyday-delay jokes, self-aware app jokes) so it doesn't
 * read as one repetitive bit. A space before the trailing ellipsis reads
 * cleaner than jamming it right against the last word.
 */
const LOADING_MESSAGES = [
  "Opening your portfolio …",
  "Finding your keys …",
  "Looking under the couch cushions …",
  "Checking your pockets one more time …",
  "It was juuust here a second ago …",
  "Retracing your steps …",
  "Turning the house upside down …",
  "Asking the dog if he's seen it …",
  "Counting your money (again) …",
  "Convincing your stocks to cooperate …",
  "Waking up your portfolio …",
  "Negotiating with the market gods …",
  "Making sure your cash didn't wander off …",
  "Polishing your gains …",
  "Reassuring your losses …",
  "Untangling your holdings …",
  "Checking if you're rich yet …",
  "Summoning your portfolio from the cloud …",
  "Dusting off the spreadsheet …",
  "Warming up the calculator …",
  "Consulting the financial oracles …",
  "Recalculating how rich you feel …",
  "Buffering your financial destiny …",
  "Doing math so you don't have to …",
  "Pretending this is instant …",
  "Shuffling numbers into place …",
  "Assembling your empire …",
  "Making it look easy …",
  "Fetching the good stuff …",
  "One sec, just flexing …",
  "Bribing the server with imaginary money …",
  "Herding your tickers into one place …",
  "Reading the fine print (there isn't any) …",
  "Asking Margus to hurry up …",
  "Double-checking you didn't buy the dip by accident …",
  "Loading, and unlike your portfolio, this won't take forever …",
  "Rehearsing your excuse for that one ticker …",
  "Giving your cash a pep talk …",
  "Waiting for the numbers to feel ready …",
  "Tidying up before you walk in …",
];

export function pickLoadingMessage(): string {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]!;
}
