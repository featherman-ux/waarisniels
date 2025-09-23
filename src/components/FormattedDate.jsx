import React from 'react';

export function FormattedDate({ date, locale = 'nl-NL', options = {} }) {
  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };

  const formatOptions = { ...defaultOptions, ...options };

  const formatDate = (dateInput) => {
    const dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
    return dateObj.toLocaleDateString(locale, formatOptions);
  };

  return <time dateTime={date instanceof Date ? date.toISOString() : date}>{formatDate(date)}</time>;
}

export default FormattedDate;