import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { Header } from './shared/header';

interface SummaryProps {
  title: string;
  overview: string;
  keyPoints: string[];
  details: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: '#1e293b',
  },
  overviewSection: {
    marginBottom: 18,
  },
  overviewLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 6,
  },
  overviewText: {
    fontSize: 11,
    lineHeight: 1.6,
    color: '#334155',
  },
  keyPointsSection: {
    marginBottom: 18,
  },
  keyPointsLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 8,
  },
  keyPoint: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingLeft: 8,
  },
  bullet: {
    fontSize: 11,
    color: '#2563eb',
    marginRight: 8,
    width: 12,
  },
  keyPointText: {
    fontSize: 11,
    lineHeight: 1.5,
    color: '#334155',
    flex: 1,
  },
  detailsSection: {
    marginBottom: 18,
  },
  detailsLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 6,
  },
  detailsText: {
    fontSize: 11,
    lineHeight: 1.6,
    color: '#334155',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    fontSize: 9,
    color: '#94a3b8',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 20,
    right: 40,
    fontSize: 9,
    color: '#94a3b8',
  },
});

export function SummaryTemplate({ title, overview, keyPoints, details }: SummaryProps) {
  const generatedAt = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header title={title} subtitle="Topic Summary" date={generatedAt} />

        <View style={styles.overviewSection}>
          <Text style={styles.overviewLabel}>Overview</Text>
          <Text style={styles.overviewText}>{overview}</Text>
        </View>

        <View style={styles.keyPointsSection}>
          <Text style={styles.keyPointsLabel}>Key Points</Text>
          {keyPoints.map((point, index) => (
            <View key={index} style={styles.keyPoint}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.keyPointText}>{point}</Text>
            </View>
          ))}
        </View>

        <View style={styles.detailsSection}>
          <Text style={styles.detailsLabel}>Details</Text>
          <Text style={styles.detailsText}>{details}</Text>
        </View>

        <Text style={styles.footer}>OpenMAIC Student Assistant</Text>
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
