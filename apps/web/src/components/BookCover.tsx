import { useState } from 'react';
import { cn } from '@/lib/cn';
import { COVER_TITLE_CQW, coverDesign, coverTitleSize, coverVars } from '@/lib/cover';
import { isRtl } from '@/lib/format';

export interface BookCoverProps {
  title: string;
  author: string;
  coverUrl?: string | null;
  className?: string;
  size?: 'card' | 'hero';
  archived?: boolean;
}

export const BookCover = ({
  title,
  author,
  coverUrl,
  className,
  size = 'card',
  archived = false,
}: BookCoverProps) => {
  const [broken, setBroken] = useState(false);
  const { shape } = coverDesign(title);
  const showImage = Boolean(coverUrl) && !broken;
  const rtl = isRtl(title);
  return (
    <div
      aria-hidden="true"
      className={cn('cover', className)}
      data-size={size}
      data-archived={archived || undefined}
      style={coverVars(title)}
    >
      {showImage ? (
        <img
          src={coverUrl ?? undefined}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="cover-image"
        />
      ) : (
        <>
          <div className="cover-art" data-shape={shape}>
            {shape === 'stripes' ? (
              <>
                <span />
                <span />
                <span />
                <span />
              </>
            ) : null}
          </div>
          <div className="cover-type" dir={rtl ? 'rtl' : 'ltr'}>
            <p
              className="cover-title"
              style={rtl ? undefined : { fontSize: `${coverTitleSize(title) / COVER_TITLE_CQW}em` }}
            >
              {title}
            </p>
            <p className="cover-author" dir={isRtl(author) ? 'rtl' : 'ltr'}>
              {author}
            </p>
          </div>
        </>
      )}
    </div>
  );
};
