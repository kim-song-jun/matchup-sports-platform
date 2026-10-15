'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Tag } from 'lucide-react';
import { TOURNAMENT_INQUIRY_TOPICS, type TournamentInquiryTopic } from './tournament-inquiry-topics';
import styles from './tournament-inquiry-topic-picker.module.css';

type TopicPickerProps = {
  readonly value: TournamentInquiryTopic;
  readonly selectedTopic: { readonly label: string; readonly description: string };
  readonly isFixed: boolean;
  readonly isPending: boolean;
  readonly onChange: (value: TournamentInquiryTopic) => void;
};

export function TournamentInquiryTopicPicker({ value, selectedTopic, isFixed, isPending, onChange }: TopicPickerProps) {
  const [activeTopic, setActiveTopic] = useState(value);
  const [isExpanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const isOpen = isExpanded && !isFixed && !isPending;

  useEffect(() => {
    if (isOpen) activeOptionRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeTopic, isOpen]);

  const selectTopic = (nextValue: TournamentInquiryTopic) => {
    if (isFixed || isPending) return;
    onChange(nextValue);
    setActiveTopic(nextValue);
    setExpanded(false);
    triggerRef.current?.focus();
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false);
      triggerRef.current?.focus();
      return;
    }
    if (key === 'Tab') {
      setExpanded(false);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) return;
    event.preventDefault();
    if (isFixed || isPending) return;
    if ((key === 'Enter' || key === ' ') && isOpen) {
      selectTopic(activeTopic);
      return;
    }
    const options = TOURNAMENT_INQUIRY_TOPICS;
    let nextIndex = options.findIndex((option) => option.value === (isOpen ? activeTopic : value));
    if (key === 'Home') nextIndex = 0;
    else if (key === 'End') nextIndex = options.length - 1;
    else if (isOpen) nextIndex = (nextIndex + (key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
    const nextTopic = options[nextIndex];
    if (nextTopic) setActiveTopic(nextTopic.value);
    setExpanded(true);
  };

  return (
    <div
      className={styles.fieldGroup}
      onKeyDown={handleKey}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
      }}
    >
      <label id={`${id}-label`} htmlFor={`${id}-control`} className="tm-text-label">문의 유형</label>
      <button
        ref={triggerRef}
        id={`${id}-control`}
        type="button"
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `${id}-list` : undefined}
        aria-activedescendant={isOpen ? `${id}-${activeTopic}` : undefined}
        disabled={isFixed || isPending}
        className={`tm-input ${styles.topicTrigger}`}
        onClick={() => {
          setActiveTopic(value);
          setExpanded(!isOpen);
        }}
      >
        <Tag size={18} aria-hidden="true" />
        <span>{selectedTopic.label}</span>
        {!isFixed ? <ChevronDown size={18} aria-hidden="true" className={isOpen ? styles.expandedChevron : undefined} /> : null}
      </button>
      {isOpen ? (
        <div id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className={styles.topicList}>
          {TOURNAMENT_INQUIRY_TOPICS.map((option) => (
            <button
              key={option.value}
              ref={option.value === activeTopic ? activeOptionRef : undefined}
              id={`${id}-${option.value}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={option.value === value}
              className={`${styles.topicOption} ${option.value === activeTopic ? styles.activeOption : ''}`}
              onClick={() => selectTopic(option.value)}
              onPointerMove={() => setActiveTopic(option.value)}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check size={18} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
      <p id={`${id}-hint`} className={styles.fieldHint}>{selectedTopic.description}</p>
    </div>
  );
}
