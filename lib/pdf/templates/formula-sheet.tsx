import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { Header } from './shared/header';

interface FormulaSheetProps {
  title: string;
  formulas: Array<{ name: string; formula: string; description: string }>;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1e293b',
  },
  columnsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  column: {
    width: '48%',
  },
  formulaCard: {
    marginBottom: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'solid',
    borderRadius: 4,
    backgroundColor: '#f8fafc',
  },
  formulaName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 3,
  },
  formulaText: {
    fontSize: 11,
    fontFamily: 'Courier',
    color: '#0f172a',
    marginBottom: 3,
    padding: 4,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  formulaDescription: {
    fontSize: 9,
    color: '#64748b',
    lineHeight: 1.4,
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

export function FormulaSheetTemplate({ title, formulas }: FormulaSheetProps) {
  const midpoint = Math.ceil(formulas.length / 2);
  const leftColumn = formulas.slice(0, midpoint);
  const rightColumn = formulas.slice(midpoint);

  const generatedAt = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header title={title} subtitle="Formula Reference Sheet" date={generatedAt} />
        <View style={styles.columnsContainer}>
          <View style={styles.column}>
            {leftColumn.map((item, index) => (
              <View key={index} style={styles.formulaCard} wrap={false}>
                <Text style={styles.formulaName}>{item.name}</Text>
                <Text style={styles.formulaText}>{item.formula}</Text>
                <Text style={styles.formulaDescription}>{item.description}</Text>
              </View>
            ))}
          </View>
          <View style={styles.column}>
            {rightColumn.map((item, index) => (
              <View key={index} style={styles.formulaCard} wrap={false}>
                <Text style={styles.formulaName}>{item.name}</Text>
                <Text style={styles.formulaText}>{item.formula}</Text>
                <Text style={styles.formulaDescription}>{item.description}</Text>
              </View>
            ))}
          </View>
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
