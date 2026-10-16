export const COMPOSER_MAX_VIEWPORT = 0.4;
export const COMPOSER_MIN_CAP_LINES = 3;

export const composerSize = ({
  contentHeight,
  lineHeight,
  verticalPadding,
  viewportHeight,
}: {
  contentHeight: number;
  lineHeight: number;
  verticalPadding: number;
  viewportHeight: number;
}): { height: number; scrolls: boolean } => {
  const cap = Math.max(
    viewportHeight * COMPOSER_MAX_VIEWPORT,
    lineHeight * COMPOSER_MIN_CAP_LINES + verticalPadding
  );
  return contentHeight > cap
    ? { height: Math.floor(cap), scrolls: true }
    : { height: contentHeight, scrolls: false };
};
