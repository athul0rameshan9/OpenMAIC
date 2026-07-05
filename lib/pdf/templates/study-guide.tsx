import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { Header } from './shared/header';

interface StudyGuideProps {
  title: string;
  sections: Array<{ heading: string; content: string }>;
  generatedAt: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: '#1e293b',
  },
  section: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    borderBottomStyle: 'solid',
  },
  sectionContent: {
    fontSize: 11,
    lineHeight: 1.6,
    color: '#334155',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 20,
    right: 40,
    fontSize: 9,
    color: '#94a3b8',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    fontSize: 9,
    color: '#94a3b8',
  },
});

export function StudyGuideTemplate({ title, sections, generatedAt }: StudyGuideProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header title={title} subtitle="Study Guide" date={generatedAt} />
        {sections.map((section, index) => (
          <View key={index} style={styles.section} wrap={false}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}
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
