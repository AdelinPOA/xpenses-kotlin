import logging
import math
import re
from collections import defaultdict

import asyncpg

logger = logging.getLogger(__name__)

class NaiveBayesClassifier:
    def __init__(self):
        self.category_counts = defaultdict(int)
        self.word_counts = defaultdict(lambda: defaultdict(int))
        self.vocab = set()
        self.total_docs = 0

    def tokenize(self, text: str) -> list[str]:
        if not text:
            return []
        # Tokenize letters only, lowercase, min length of 3
        return [w.lower() for w in re.findall(r'[a-zA-Z]{3,}', text)]

    def train(self, data: list[tuple[str, int]]):
        self.category_counts.clear()
        self.word_counts.clear()
        self.vocab.clear()
        self.total_docs = len(data)

        for text, cat_id in data:
            self.category_counts[cat_id] += 1
            words = self.tokenize(text)
            for w in words:
                self.word_counts[cat_id][w] += 1
                self.vocab.add(w)

    def predict(self, text: str) -> int | None:
        if not self.category_counts or not self.total_docs:
            return None

        words = self.tokenize(text)
        if not words:
            return None

        best_cat = None
        max_log_prob = -float('inf')
        vocab_size = len(self.vocab)

        for cat_id, cat_count in self.category_counts.items():
            # Log Prior Probability: log(P(C))
            log_prob = math.log(cat_count / self.total_docs)

            # Total words in this category
            total_words_in_cat = sum(self.word_counts[cat_id].values())

            # Log Likelihood with Laplace smoothing: log(P(W|C))
            for w in words:
                if w in self.vocab:
                    word_count = self.word_counts[cat_id][w]
                    log_prob += math.log((word_count + 1) / (total_words_in_cat + vocab_size))

            if log_prob > max_log_prob:
                max_log_prob = log_prob
                best_cat = cat_id

        return best_cat


async def train_local_classifier(db: asyncpg.Connection) -> NaiveBayesClassifier | None:
    try:
        rows = await db.fetch(
            "SELECT raw_ocr_text, category_id FROM expenses WHERE raw_ocr_text IS NOT NULL AND category_id IS NOT NULL"
        )
        if len(rows) < 5:  # Require at least 5 examples to boot up the ML model
            return None
        data = [(r["raw_ocr_text"], r["category_id"]) for r in rows]
        classifier = NaiveBayesClassifier()
        classifier.train(data)
        return classifier
    except Exception as e:
        logger.error(f"Failed to train local NaiveBayes classifier: {e}")
        return None
